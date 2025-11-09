package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bradfitz/gomemcache/memcache"
	_ "github.com/go-sql-driver/mysql"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

// --- Struct Definitions ---

type Customer struct {
	CustomerID       int64     `json:"customer_id"`
	Name             string    `json:"name"`
	Age              int       `json:"age"`
	Address          string    `json:"address"`
	PhoneNumber      *string   `json:"phone_number,omitempty"`
	Email            *string   `json:"email,omitempty"`
	PassportID       *string   `json:"passport_id,omitempty"`
	AadharID         *string   `json:"aadhar_id,omitempty"`
	DrivingLicenseID *string   `json:"driving_license_id,omitempty"`
	CreatedAt        time.Time `json:"created_at,omitempty"`
}

type Product struct {
	ProductID   int     `json:"product_id"`
	CustomerID  int64   `json:"customer_id"`
	ProductName string  `json:"product_name"`
	Quantity    int     `json:"quantity"`
	Price       float64 `json:"price"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// FIX: Ensure 'Customers' field uses the correct lowercase JSON tag "customers"
type SuccessResponse struct {
	Message   string     `json:"message"`
	Customer  *Customer  `json:"customer,omitempty"`
	Products  []Product  `json:"products,omitempty"`
	Customers []Customer `json:"customers,omitempty"` // <-- CRITICAL FIX for UI list endpoint
}

var db *sql.DB
var mc *memcache.Client

// Initialize the random source
func init() {
	// Use time.Now().UnixNano() directly as seed source
	rand.NewSource(time.Now().UnixNano())
}

// --- Utility Functions (Unchanged) ---

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// generateUniqueID generates a unique 10-digit Customer ID
func generateUniqueID(tx *sql.Tx) (int64, error) {
	const maxRetries = 5
	for i := 0; i < maxRetries; i++ {
		// Generate a 10-digit number (1,000,000,000 to 9,999,999,999)
		id := rand.Int63n(9000000000) + 1000000000

		// Check if the ID already exists in the database
		var exists bool
		err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM customers WHERE customer_id = ?)", id).Scan(&exists)
		if err != nil && err != sql.ErrNoRows {
			return 0, fmt.Errorf("database check failed: %w", err)
		}

		if !exists {
			return id, nil
		}
		log.Printf("Generated ID %d already exists. Retrying...", id)
	}
	return 0, fmt.Errorf("failed to generate unique customer ID after %d retries", maxRetries)
}

// --- DB/Memcached Initialization (Unchanged) ---

func initDB() error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		getEnv("DB_USER", "rghoshal"),
		getEnv("DB_PASSWORD", "Putishwar2345@"),
		getEnv("DB_HOST", "customer_mariadb"),
		getEnv("DB_PORT", "3306"),
		getEnv("DB_NAME", "customerDB"),
	)

	const maxRetries = 10
	initialWait := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		var err error

		db, err = sql.Open("mysql", dsn)
		if err != nil {
			return fmt.Errorf("failed to open database connection: %w", err)
		}

		if err = db.Ping(); err == nil {
			log.Println("Successfully connected and pinged database.")
			db.SetMaxOpenConns(25)
			db.SetMaxIdleConns(5)
			db.SetConnMaxLifetime(5 * time.Minute)
			return nil
		}

		log.Printf("DB Ping failed (attempt %d/%d): %v. Retrying in %v...", i+1, maxRetries, err, initialWait)
		// Close the connection attempt before retrying
		if db != nil {
			db.Close()
		}
		time.Sleep(initialWait)

		initialWait = initialWait * 2
		if initialWait > 8*time.Second {
			initialWait = 8 * time.Second
		}
	}

	return fmt.Errorf("failed to connect to database after %d retries", maxRetries)
}

func initMemcached() {
	mc = memcache.New(getEnv("MEMCACHED_HOST", "localhost:11211"))
}

// --- Handlers ---

// createCustomer: (Unchanged)
func createCustomer(w http.ResponseWriter, r *http.Request) {
	var customer Customer
	if err := json.NewDecoder(r.Body).Decode(&customer); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if customer.Name == "" || customer.Age <= 0 || customer.Address == "" {
		respondWithError(w, http.StatusBadRequest, "Name, age, and address are mandatory")
		return
	}

	if customer.AadharID == nil && customer.PassportID == nil && customer.DrivingLicenseID == nil {
		respondWithError(w, http.StatusBadRequest, "At least one ID document (Aadhar/Passport/Driving License) is required")
		return
	}

	tx, err := db.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to start transaction: %v", err))
		return
	}
	defer tx.Rollback()

	newID, err := generateUniqueID(tx)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, err.Error())
		return
	}
	customer.CustomerID = newID

	query := `INSERT INTO customers (customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err = tx.Exec(query, customer.CustomerID, customer.Name, customer.Age, customer.Address,
		customer.PhoneNumber, customer.Email, customer.PassportID, customer.AadharID, customer.DrivingLicenseID)

	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			respondWithError(w, http.StatusConflict, "ID document already exists in database")
			return
		}
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Database error: %v", err))
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to commit transaction: %v", err))
		return
	}

	// Fetch the customer again to get the correct created_at timestamp
	err = db.QueryRow(`SELECT created_at FROM customers WHERE customer_id = ?`, customer.CustomerID).Scan(&customer.CreatedAt)
	if err != nil {
		log.Printf("Warning: Failed to fetch created_at after insert: %v", err)
	}

	cacheCustomer(customer)

	respondWithJSON(w, http.StatusCreated, SuccessResponse{
		Message:  "Customer created successfully",
		Customer: &customer,
	})
}

// getAllCustomers handles GET /api/customers/all (NEW ENDPOINT for 'View All')
func getAllCustomers(w http.ResponseWriter, r *http.Request) {
	query := `SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers ORDER BY customer_id DESC`
	rows, err := db.Query(query)
	if err != nil {
		log.Printf("Database query error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to retrieve all customers due to query error")
		return
	}
	defer rows.Close()

	customers := []Customer{}
	for rows.Next() {
		var customer Customer
		if err := rows.Scan(
			&customer.CustomerID, &customer.Name, &customer.Age, &customer.Address,
			&customer.PhoneNumber, &customer.Email, &customer.PassportID,
			&customer.AadharID, &customer.DrivingLicenseID, &customer.CreatedAt,
		); err != nil {
			log.Printf("Scan error for getAllCustomers: %v", err)
			continue
		}
		customers = append(customers, customer)
	}

	// Check for errors encountered during iteration
	if err := rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Error reading customer data during iteration")
		return
	}

	// CRITICAL: Respond with the correct SuccessResponse structure containing the 'customers' array.
	respondWithJSON(w, http.StatusOK, SuccessResponse{
		Message:   fmt.Sprintf("Successfully retrieved %d customers", len(customers)),
		Customers: customers, // Uses the json:"customers" tag
	})
}

// getCustomerByID: ADJUSTED to search by customer_id AND existing ID types
func getCustomerByID(w http.ResponseWriter, r *http.Request) {
	idType := r.URL.Query().Get("type")
	idValue := r.URL.Query().Get("value")

	if idType == "" || idValue == "" {
		respondWithError(w, http.StatusBadRequest, "ID type and value are required")
		return
	}

	// Cache lookup logic
	cacheKey := fmt.Sprintf("customer:%s:%s", idType, idValue)
	if item, err := mc.Get(cacheKey); err == nil {
		var customer Customer
		if json.Unmarshal(item.Value, &customer) == nil {
			respondWithJSON(w, http.StatusOK, customer)
			return
		}
	}

	var query string
	switch idType {
	case "customer_id": // NEW Search Option
		query = "SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers WHERE customer_id = ?"
	case "aadhar":
		query = "SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers WHERE aadharID = ?"
	case "passport":
		query = "SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers WHERE passportID = ?"
	case "driving_license":
		query = "SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers WHERE drivingLicenseID = ?"
	default:
		respondWithError(w, http.StatusBadRequest, "Invalid ID type. Use: customer_id, aadhar, passport, or driving_license")
		return
	}

	var customer Customer
	err := db.QueryRow(query, idValue).Scan(
		&customer.CustomerID, &customer.Name, &customer.Age, &customer.Address,
		&customer.PhoneNumber, &customer.Email, &customer.PassportID,
		&customer.AadharID, &customer.DrivingLicenseID, &customer.CreatedAt,
	)

	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Customer not found")
		return
	} else if err != nil {
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to retrieve customer")
		return
	}

	cacheCustomer(customer)

	respondWithJSON(w, http.StatusOK, customer)
}

// addProduct: (Unchanged)
func addProduct(w http.ResponseWriter, r *http.Request) {
	var product Product
	if err := json.NewDecoder(r.Body).Decode(&product); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if product.CustomerID <= 0 || product.ProductName == "" || product.Quantity <= 0 || product.Price <= 0 {
		respondWithError(w, http.StatusBadRequest, "All product fields are required and must be valid")
		return
	}

	tx, err := db.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	var exists bool
	err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM customers WHERE customer_id = ?)", product.CustomerID).Scan(&exists)
	if err != nil || !exists {
		respondWithError(w, http.StatusNotFound, "Customer not found")
		return
	}

	query := `INSERT INTO products (customer_id, product_name, quantity, price) VALUES (?, ?, ?, ?)`
	result, err := tx.Exec(query, product.CustomerID, product.ProductName, product.Quantity, product.Price)

	if err != nil {
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to add product")
		return
	}

	id, _ := result.LastInsertId()
	product.ProductID = int(id)

	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit product transaction")
		return
	}

	respondWithJSON(w, http.StatusCreated, SuccessResponse{
		Message: "Product added successfully",
	})
}

// getProductsByCustomer: (Unchanged)
func getProductsByCustomer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	customerID := vars["customer_id"]

	query := `SELECT product_id, customer_id, product_name, quantity, price FROM products WHERE customer_id = ?`
	rows, err := db.Query(query, customerID)
	if err != nil {
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to retrieve products")
		return
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var product Product
		if err := rows.Scan(&product.ProductID, &product.CustomerID, &product.ProductName, &product.Quantity, &product.Price); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		products = append(products, product)
	}

	respondWithJSON(w, http.StatusOK, SuccessResponse{
		Products: products,
	})
}

// updateCustomer: (Unchanged logic, uses customer_id from URL)
func updateCustomer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["customer_id"]

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid customer ID format")
		return
	}

	var customer Customer
	if err := json.NewDecoder(r.Body).Decode(&customer); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	customer.CustomerID = id

	if customer.Name == "" || customer.Age <= 0 || customer.Address == "" {
		respondWithError(w, http.StatusBadRequest, "Name, age, and address are mandatory")
		return
	}

	if customer.AadharID == nil && customer.PassportID == nil && customer.DrivingLicenseID == nil {
		respondWithError(w, http.StatusBadRequest, "At least one ID document is required")
		return
	}

	query := `UPDATE customers SET 
                name = ?, age = ?, address = ?, phoneNumber = ?, 
                email = ?, passportID = ?, aadharID = ?, drivingLicenseID = ? 
              WHERE customer_id = ?`

	result, err := db.Exec(query,
		customer.Name, customer.Age, customer.Address, customer.PhoneNumber,
		customer.Email, customer.PassportID, customer.AadharID, customer.DrivingLicenseID,
		customer.CustomerID)

	if err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			respondWithError(w, http.StatusConflict, "Updated ID document already exists with another customer")
			return
		}
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to update customer")
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		respondWithError(w, http.StatusNotFound, "Customer not found")
		return
	}

	var updatedCustomer Customer
	fetchQuery := "SELECT customer_id, name, age, address, phoneNumber, email, passportID, aadharID, drivingLicenseID, created_at FROM customers WHERE customer_id = ?"
	err = db.QueryRow(fetchQuery, customer.CustomerID).Scan(
		&updatedCustomer.CustomerID, &updatedCustomer.Name, &updatedCustomer.Age, &updatedCustomer.Address,
		&updatedCustomer.PhoneNumber, &updatedCustomer.Email, &updatedCustomer.PassportID,
		&updatedCustomer.AadharID, &updatedCustomer.DrivingLicenseID, &updatedCustomer.CreatedAt,
	)
	if err != nil {
		log.Printf("Failed to re-fetch customer data after update: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Customer updated, but failed to retrieve latest data")
		return
	}

	deleteCustomerCache(customer.CustomerID)
	cacheCustomer(updatedCustomer)

	respondWithJSON(w, http.StatusOK, updatedCustomer)
}

// deleteCustomer: (Unchanged logic, uses customer_id from URL and transaction)
func deleteCustomer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["customer_id"]

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid customer ID format")
		return
	}

	// Must delete cache BEFORE beginning the transaction, but we need the current IDs for the cache keys
	// Perform lookup for cache invalidation before deletion
	var aadharID, passportID, drivingLicenseID sql.NullString
	err = db.QueryRow("SELECT aadharID, passportID, drivingLicenseID FROM customers WHERE customer_id = ?", id).Scan(
		&aadharID, &passportID, &drivingLicenseID)

	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Customer not found")
		return
	} else if err != nil {
		log.Printf("Cache lookup pre-delete failed: %v", err)
		// Continue with deletion, but log the cache failure
	}

	// Start transaction for atomic deletion
	tx, err := db.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// 1. Delete customer (assuming ON DELETE CASCADE handles products)
	result, err := tx.Exec("DELETE FROM customers WHERE customer_id = ?", id)
	if err != nil {
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to delete customer")
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		respondWithError(w, http.StatusNotFound, "Customer not found")
		return
	}

	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit delete transaction")
		return
	}

	// 2. Clear cache using the IDs fetched BEFORE deletion
	deleteCustomerCacheFromIDs(id, aadharID, passportID, drivingLicenseID)

	respondWithJSON(w, http.StatusOK, SuccessResponse{
		Message: fmt.Sprintf("Customer ID %d and associated products deleted successfully", id),
	})
}

// deleteProduct: (Unchanged)
func deleteProduct(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	customerIDStr := vars["customer_id"]
	productIDStr := vars["product_id"]

	customerID, err := strconv.ParseInt(customerIDStr, 10, 64)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid customer ID format")
		return
	}
	productID, err := strconv.Atoi(productIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid product ID format")
		return
	}

	result, err := db.Exec("DELETE FROM products WHERE customer_id = ? AND product_id = ?", customerID, productID)

	if err != nil {
		log.Printf("Database error: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to delete product")
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		respondWithError(w, http.StatusNotFound, "Product not found for the given customer")
		return
	}

	respondWithJSON(w, http.StatusOK, SuccessResponse{
		Message: fmt.Sprintf("Product ID %d for Customer ID %d deleted successfully", productID, customerID),
	})
}

// flushData: (Unchanged)
func flushData(w http.ResponseWriter, r *http.Request) {
	tx, err := db.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec("SET FOREIGN_KEY_CHECKS=0"); err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to disable FK checks: %v", err))
		return
	}

	if _, err := tx.Exec("TRUNCATE TABLE products"); err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to truncate products: %v", err))
		return
	}

	if _, err := tx.Exec("TRUNCATE TABLE customers"); err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to truncate customers: %v", err))
		return
	}

	if _, err := tx.Exec("SET FOREIGN_KEY_CHECKS=1"); err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to re-enable FK checks: %v", err))
		return
	}

	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit flush transaction")
		return
	}

	if err := mc.FlushAll(); err != nil {
		log.Printf("Warning: Failed to flush Memcached: %v", err)
	}

	respondWithJSON(w, http.StatusOK, SuccessResponse{
		Message: "All customer and product data successfully flushed.",
	})
}

// --- Cache Functions ---

// Helper function to delete cache using known IDs
func deleteCustomerCacheFromIDs(customerID int64, aadharID, passportID, drivingLicenseID sql.NullString) {
	if aadharID.Valid {
		mc.Delete(fmt.Sprintf("customer:aadhar:%s", aadharID.String))
	}
	if passportID.Valid {
		mc.Delete(fmt.Sprintf("customer:passport:%s", passportID.String))
	}
	if drivingLicenseID.Valid {
		mc.Delete(fmt.Sprintf("customer:driving_license:%s", drivingLicenseID.String))
	}
	mc.Delete(fmt.Sprintf("customer:customer_id:%d", customerID))
}

// deleteCustomerCache: Fetches IDs and invalidates cache
func deleteCustomerCache(customerID int64) {
	var aadharID, passportID, drivingLicenseID sql.NullString

	err := db.QueryRow("SELECT aadharID, passportID, drivingLicenseID FROM customers WHERE customer_id = ?", customerID).Scan(
		&aadharID, &passportID, &drivingLicenseID)

	if err == sql.ErrNoRows {
		return
	} else if err != nil {
		log.Printf("Cache deletion lookup failed for ID %d: %v", customerID, err)
		return
	}

	deleteCustomerCacheFromIDs(customerID, aadharID, passportID, drivingLicenseID)
}

// cacheCustomer: Caches by all ID types including customer_id
func cacheCustomer(customer Customer) {
	data, err := json.Marshal(customer)
	if err != nil {
		return
	}

	const cacheExpiration = 3600 // 1 hour TTL

	// Cache by ID documents
	if customer.AadharID != nil {
		mc.Set(&memcache.Item{
			Key:        fmt.Sprintf("customer:aadhar:%s", *customer.AadharID),
			Value:      data,
			Expiration: cacheExpiration,
		})
	}
	if customer.PassportID != nil {
		mc.Set(&memcache.Item{
			Key:        fmt.Sprintf("customer:passport:%s", *customer.PassportID),
			Value:      data,
			Expiration: cacheExpiration,
		})
	}
	if customer.DrivingLicenseID != nil {
		mc.Set(&memcache.Item{
			Key:        fmt.Sprintf("customer:driving_license:%s", *customer.DrivingLicenseID),
			Value:      data,
			Expiration: cacheExpiration,
		})
	}

	// Cache by CustomerID for the search tab's primary key lookup
	mc.Set(&memcache.Item{
		Key:        fmt.Sprintf("customer:customer_id:%d", customer.CustomerID),
		Value:      data,
		Expiration: cacheExpiration,
	})
}

// --- Main Function (Routing and Server) ---

func healthCheck(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, ErrorResponse{Error: message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func main() {
	if err := initDB(); err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	initMemcached()

	router := mux.NewRouter()

	// Health Check
	router.HandleFunc("/api/health", healthCheck).Methods("GET")

	// Customer Endpoints
	router.HandleFunc("/api/customers", createCustomer).Methods("POST")
	// ✅ NEW ROUTE: Get all customers for the 'View All' tab
	router.HandleFunc("/api/customers/all", getAllCustomers).Methods("GET")
	// ✅ ADJUSTED ROUTE: Search handles customer_id, aadhar, passport, or driving_license
	router.HandleFunc("/api/customers/search", getCustomerByID).Methods("GET")
	// Existing routes using customer_id
	router.HandleFunc("/api/customers/{customer_id}", updateCustomer).Methods("PUT")
	router.HandleFunc("/api/customers/{customer_id}", deleteCustomer).Methods("DELETE")

	// Product Endpoints
	router.HandleFunc("/api/products", addProduct).Methods("POST")
	router.HandleFunc("/api/products/{customer_id}", getProductsByCustomer).Methods("GET")
	router.HandleFunc("/api/products/{customer_id}/{product_id}", deleteProduct).Methods("DELETE")

	// Utility/Maintenance Endpoint
	router.HandleFunc("/api/flush", flushData).Methods("POST")

	// CORS
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}).Handler(router)

	port := getEnv("PORT", "8080")
	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
