# 🌟 Go Customer and Product Management API

This is a high-performance, containerized backend API built with Go (Golang) designed to manage customer records and their associated products. The architecture emphasizes data integrity through database transactions and utilizes an in-memory caching system to optimize read performance.

## 🚀 Key Features

* **Go Backend:** Built for concurrency and speed using standard Go libraries and `gorilla/mux`.
* **Data Consistency:** Enforces transactional integrity for critical operations like customer creation and deletion (which cascades to products).
* **Flexible Search:** Customers can be looked up by **`customer_id`**, **Aadhar ID**, **Passport ID**, or **Driving License ID**.
* **Caching:** Implements Memcached for fast lookup of customer data, reducing load on the database.
* **Containerized Environment:** Uses Docker Compose to provision the entire three-tier infrastructure (API, Database, Cache) with a single command.

---

## 🛠️ Infrastructure Setup (Docker Compose)

The project uses Docker Compose to manage its services. The `docker-compose.yml` file defines the three core services:

* **`app`:** The Go API service.
* **`customer_mariadb`:** The relational database service.
* **`memcached`:** The in-memory caching service.

### `docker-compose.yml` Configuration

```yaml
version: '3.8'

services:
  app:
    build: . # Assumes a Dockerfile is present in the root directory
    container_name: go_customer_api
    ports:
      - "8080:8080"
    depends_on:
      - customer_mariadb
      - memcached
    environment:
      # These variables match the defaults used in main.go: initDB()
      DB_HOST: customer_mariadb
      DB_PORT: 3306
      DB_USER: root
      DB_PASSWORD: password
      DB_NAME: customerDB
      MEMCACHED_HOST: memcached:11211 # Service name used for internal network resolution
    networks:
      - custom-network
    # Optional: If you need to map the Go project directory for hot reloading or logs
    # volumes:
    #   - .:/app

  customer_mariadb:
    image: mariadb:10.6
    container_name: customer_mariadb
    environment:
      # Database access details used by the Go app
      MARIADB_ROOT_PASSWORD: password
      MARIADB_DATABASE: customerDB
    volumes:
      # Ensure data persistence
      - mariadb_data:/var/lib/mysql
      # Optional: To run initial SQL setup scripts
      # - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - custom-network
    # Expose the port externally for local access/debugging (optional, but useful)
    ports:
      - "3306:3306"

  memcached:
    image: memcached:latest
    container_name: customer_memcached
    networks:
      - custom-network

networks:
  custom-network:
    driver: bridge

volumes:
  mariadb_data:# SystemDesign_CustomerManagementService

⚙️ Getting Started
Prerequisites
Docker and Docker Compose installed.

Go runtime (for local development/testing).

Running the Application

1. Clone the repository:
git clone [Your Repository URL]
cd [your-project-folder]

2. Start the services:
docker-compose up --build -d

This command builds the Go application image, starts the MariaDB database, and the Memcached service.

3. Access the API: The API will be available at http://localhost:8080.

🚀 Frontend Integration & Data Flow
This API is designed to support a frontend management dashboard (likely built with React/Vue/Angular, based on the UI messages encountered).

Frontend UI Messages
The UI communicates state clearly:

All Existing Customers (0): The backend successfully returned an empty list of customers.

No customers found in the database. Create a customer in the 'Create Customer' tab.: This message is displayed when the list is empty, guiding the user to the next step.

Backend Handlers
The primary API handler for listing customers is /api/customers/all.

// Simplified Go response structure:
respondWithJSON(w, http.StatusOK, SuccessResponse{
    Message:   fmt.Sprintf("Successfully retrieved %d customers", len(customers)),
    Customers: customers, // Frontend expects this lowercase key
})

The React frontend expects a JSON response containing the array under the customers (lowercase) key for the display list to render correctly.

Endpoints (Examples)

### Endpoints (Examples)

| Action | Method | URL | Example Payload (POST/PUT) |
| :--- | :--- | :--- | :--- |
| **Create Customer** | `POST` | `/api/customers` | `{"name": "Jane Doe", "age": 30, "address": "123 Main St", "aadhar_id": "123456789012"}` |
| **View All** | `GET` | `/api/customers/all` | (No payload) |
| **Search by ID** | `GET` | `/api/customers/search?type=aadhar&value=123456789012` | (No payload) |
| **Delete Customer** | `DELETE` | `/api/customers/1000000001` | (No payload) |
| **Add Product** | `POST` | `/api/products` | `{"customer_id": 1000000001, "product_name": "Laptop", "quantity": 1, "price": 1200.00}` |
