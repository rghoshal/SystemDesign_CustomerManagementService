-- Create database
CREATE DATABASE IF NOT EXISTS customerDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE customerDB;

-- Remodeled CREATE TABLE statement for the 'customers' table

CREATE TABLE IF NOT EXISTS customers (
    -- Primary Key: Matches the desired schema (customer_id BIGINT(20) NOT NULL PRI AUTO_INCREMENT)
    customer_id BIGINT(20) NOT NULL AUTO_INCREMENT PRIMARY KEY,

    -- Basic fields. Note: The DESCRIBE output allows NULL (YES in Null column), 
    -- but your Go code validation requires name, age, address. 
    -- I'm keeping them nullable as per your DESCRIBE, but be aware of Go's NOT NULL validation.
    name VARCHAR(100),
    age INT(11),
    address VARCHAR(255), 
    
    -- Communication fields: Match Go struct and DESCRIBE output field names
    phoneNumber VARCHAR(20),
    email VARCHAR(100),

    -- ID documents: Match Go struct and DESCRIBE output field names (passportID, aadharID, drivingLicenseID)
    -- They are defined as UNIQUE keys, as per your DESCRIBE output.
    passportID VARCHAR(50) UNIQUE,
    aadharID VARCHAR(50) UNIQUE,
    drivingLicenseID VARCHAR(50) UNIQUE,
    
    -- Missing fields from DESCRIBE but present in Go struct / common practice:
    -- If your Go struct uses 'CreatedAt', you should explicitly add it.
    -- Assuming created_at is desired (from your original schema, though not in the DESCRIBE output)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 

    -- Removed the pan_card field, as it was not present in your DESCRIBE output.
    
    -- The CHECK constraint from your original schema is good practice to enforce ID requirement:
    CHECK (
        aadharID IS NOT NULL OR 
        passportID IS NOT NULL OR 
        drivingLicenseID IS NOT NULL
    )
    -- Removed age CHECK constraint since age is nullable in your DESCRIBE output.
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create products table (MISSING TABLE ADDED)
-- Remodeled CREATE TABLE statement for the 'products' table

CREATE TABLE IF NOT EXISTS products (
    -- Primary Key: Matches the desired schema (product_id INT(11) NOT NULL PRI AUTO_INCREMENT)
    product_id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY, 
    
    -- Foreign Key: Matches the desired schema (customer_id BIGINT(20) MUL)
    customer_id BIGINT(20), 
    
    -- Data Fields: Match the desired schema's types and lengths
    product_name VARCHAR(100),
    quantity INT(11),
    price DOUBLE,
    
    -- Define Foreign Key relationship: 
    -- CRITICAL FIX: Reference the correct column name (customer_id) in the 'customers' table.
    FOREIGN KEY (customer_id) 
        REFERENCES customers(customer_id) -- Ensures it points to the customers table's primary key
        ON DELETE CASCADE 
        ON UPDATE CASCADE -- Added ON UPDATE CASCADE as good practice for FKs
        
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample queries for testing
-- INSERT INTO customers (name, age, address, aadhar) VALUES ('John Doe', 30, '123 Main St', '123456789012');
-- SELECT * FROM customers WHERE aadhar = '123456789012';
-- SELECT * FROM customers WHERE passport = 'A1234567';