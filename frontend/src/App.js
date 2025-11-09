import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle,
  User,
  Search,
  Plus,
  Package,
  Trash2,
  Edit,
  RotateCcw,
  List,
} from "lucide-react";

const API_BASE_URL = "http://localhost:8080/api";
const RATE_LIMIT_KEY = "customerCreationTimestamps";
const MAX_REQUESTS = 10;
const TIME_WINDOW = 3600000; // 1 hour in milliseconds

export default function CustomerManagement() {
  const [activeTab, setActiveTab] = useState("create");
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    address: "",
    phone_number: "",
    email: "",
    aadhar_id: "",
    passport_id: "",
    driving_license_id: "",
  });
  const [productData, setProductData] = useState({
    customer_id: "",
    product_name: "",
    quantity: "",
    price: "",
  });
  const [searchValue, setSearchValue] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [remainingRequests, setRemainingRequests] = useState(MAX_REQUESTS);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  // NEW State for holding all customers
  const [allCustomers, setAllCustomers] = useState([]);

  useEffect(() => {
    updateRemainingRequests();
  }, []);

  // --- Utility Functions ---

  const updateRemainingRequests = () => {
    const storedData = localStorage.getItem(RATE_LIMIT_KEY);
    const timestamps = storedData ? JSON.parse(storedData) : [];
    const now = Date.now();
    const validTimestamps = timestamps.filter((ts) => now - ts < TIME_WINDOW);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(validTimestamps));
    setRemainingRequests(MAX_REQUESTS - validTimestamps.length);
  };

  const checkRateLimit = () => {
    const storedData = localStorage.getItem(RATE_LIMIT_KEY);
    const timestamps = storedData ? JSON.parse(storedData) : [];
    const now = Date.now();
    const validTimestamps = timestamps.filter((ts) => now - ts < TIME_WINDOW);

    if (validTimestamps.length >= MAX_REQUESTS) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const timeUntilReset = TIME_WINDOW - (now - oldestTimestamp);
      const minutesRemaining = Math.ceil(timeUntilReset / 60000);
      return { allowed: false, minutesRemaining };
    }

    validTimestamps.push(now);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(validTimestamps));
    setRemainingRequests(MAX_REQUESTS - validTimestamps.length);
    return { allowed: true };
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProductChange = (e) => {
    const { name, value } = e.target;
    setProductData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMessage({ type: "", text: "" });
    if (tab === "viewAll") {
      fetchAllCustomers();
    }
    // Clear search results when switching tabs
    if (tab !== "search") {
      setSearchResult(null);
      setProducts([]);
      setIsEditing(false);
    }
  };

  // --- API Functions ---

  // NEW: Fetch All Customers Function
  const fetchAllCustomers = async () => {
    setMessage({ type: "", text: "" });
    setLoading(true);
    setAllCustomers([]);
    try {
      const response = await fetch(`${API_BASE_URL}/customers/all`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch all customers");
      }

      setAllCustomers(data.customers || []);
      setMessage({
        type: "success",
        text: `Successfully loaded ${data.customers.length} customers.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      setAllCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      setMessage({
        type: "error",
        text: `Rate limit exceeded. You can create more customers in ${rateLimitCheck.minutesRemaining} minutes. (Max 10 per hour)`,
      });
      return;
    }

    if (!formData.name || !formData.age || !formData.address) {
      setMessage({
        type: "error",
        text: "Name, age, and address are required",
      });
      return;
    }

    if (
      !formData.aadhar_id &&
      !formData.passport_id &&
      !formData.driving_license_id
    ) {
      setMessage({
        type: "error",
        text: "At least one ID document is required",
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        age: parseInt(formData.age),
        address: formData.address,
        phone_number: formData.phone_number || null,
        email: formData.email || null,
        aadhar_id: formData.aadhar_id || null,
        passport_id: formData.passport_id || null,
        driving_license_id: formData.driving_license_id || null,
      };

      const response = await fetch(`${API_BASE_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create customer");
      }

      setMessage({
        type: "success",
        text: `Customer created successfully! ID: ${data.customer.customer_id}`,
      });
      setFormData({
        name: "",
        age: "",
        address: "",
        phone_number: "",
        email: "",
        aadhar_id: "",
        passport_id: "",
        driving_license_id: "",
      });
      updateRemainingRequests();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    setSearchResult(null);
    setProducts([]);
    setIsEditing(false);

    if (!searchValue) {
      setMessage({ type: "error", text: "Please enter a Customer ID" });
      return;
    }

    if (!/^\d{10}$/.test(searchValue)) {
      setMessage({
        type: "error",
        text: "Customer ID must be a 10-digit number.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/search?type=customer_id&value=${encodeURIComponent(
          searchValue
        )}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Customer not found");
      }

      setSearchResult(data);
      setMessage({ type: "success", text: "Customer found!" });

      fetchProducts(data.customer_id);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (customerId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${customerId}`);
      const data = await response.json();
      if (response.ok && data.products) {
        setProducts(data.products);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
      setProducts([]);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (
      !productData.customer_id ||
      !productData.product_name ||
      !productData.quantity ||
      !productData.price
    ) {
      setMessage({ type: "error", text: "All product fields are required" });
      return;
    }

    if (!/^\d{10}$/.test(productData.customer_id)) {
      setMessage({
        type: "error",
        text: "Customer ID must be a 10-digit number.",
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        customer_id: parseInt(productData.customer_id),
        product_name: productData.product_name,
        quantity: parseInt(productData.quantity),
        price: parseFloat(productData.price),
      };

      const response = await fetch(`${API_BASE_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add product");
      }

      setMessage({ type: "success", text: "Product added successfully!" });
      setProductData({
        customer_id: "",
        product_name: "",
        quantity: "",
        price: "",
      });

      if (
        searchResult &&
        searchResult.customer_id.toString() === payload.customer_id.toString()
      ) {
        fetchProducts(searchResult.customer_id);
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCustomer = async () => {
    setMessage({ type: "", text: "" });
    setLoading(true);
    try {
      const customerId = editFormData.customer_id;
      const payload = {
        name: editFormData.name,
        age: parseInt(editFormData.age),
        address: editFormData.address,
        phone_number: editFormData.phone_number || null,
        email: editFormData.email || null,
        aadhar_id: editFormData.aadhar_id || null,
        passport_id: editFormData.passport_id || null,
        driving_license_id: editFormData.driving_license_id || null,
      };

      if (
        payload.aadhar_id == null &&
        payload.passport_id == null &&
        payload.driving_license_id == null
      ) {
        throw new Error("At least one ID document is required for update.");
      }

      const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update customer");
      }

      setMessage({ type: "success", text: "Customer updated successfully!" });
      setIsEditing(false);
      // Re-set search result with the updated data
      setSearchResult(data);
      setEditFormData({});
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (customerId) => {
    if (
      !window.confirm(
        `Are you sure you want to delete Customer ID ${customerId} and all associated products?`
      )
    ) {
      return;
    }
    setMessage({ type: "", text: "" });
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete customer");
      }

      setMessage({
        type: "success",
        text: data.message || `Customer ID ${customerId} deleted successfully!`,
      });
      setSearchResult(null);
      setProducts([]);
      // Refresh the 'View All' list if the tab is active
      if (activeTab === "viewAll") {
        fetchAllCustomers();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (customerId, productId) => {
    if (
      !window.confirm(
        `Are you sure you want to delete Product ID ${productId} for Customer ID ${customerId}?`
      )
    ) {
      return;
    }
    setMessage({ type: "", text: "" });
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/products/${customerId}/${productId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete product");
      }

      setMessage({
        type: "success",
        text: data.message || `Product ID ${productId} deleted successfully!`,
      });

      fetchProducts(customerId);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFlushAllData = async () => {
    if (
      !window.confirm(
        "WARNING: This will permanently delete ALL customer and product data. Proceed?"
      )
    ) {
      return;
    }
    setMessage({ type: "", text: "" });
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/flush`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to flush data");
      }

      setMessage({
        type: "success",
        text:
          data.message || "All customer and product data successfully flushed.",
      });
      setSearchResult(null);
      setProducts([]);
      setIsEditing(false);
      setEditFormData({});
      setAllCustomers([]); // Clear the list on flush
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setIsEditing(true);
    // Populate the edit form state with current search result data
    setEditFormData({
      customer_id: searchResult.customer_id,
      name: searchResult.name,
      age: searchResult.age,
      address: searchResult.address,
      // Handle optional fields
      phone_number: searchResult.phone_number || "",
      email: searchResult.email || "",
      aadhar_id: searchResult.aadhar_id || "",
      passport_id: searchResult.passport_id || "",
      driving_license_id: searchResult.driving_license_id || "",
    });
  };

  // --- Render Logic ---

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex justify-between items-center">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <User className="w-8 h-8" />
              Customer Management System
            </h1>

            <button
              onClick={handleFlushAllData}
              disabled={loading}
              className="flex items-center gap-2 bg-red-500 text-white text-sm py-2 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              title="Permanently delete ALL customer and product data"
            >
              <RotateCcw className="w-4 h-4" />
              Flush All Data
            </button>
          </div>

          <div className="flex border-b">
            <button
              onClick={() => handleTabChange("create")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === "create"
                  ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Plus className="w-5 h-5" />
              Create Customer
            </button>
            <button
              onClick={() => handleTabChange("search")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === "search"
                  ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Search className="w-5 h-5" />
              Search & Manage
            </button>
            <button
              onClick={() => handleTabChange("viewAll")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === "viewAll"
                  ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <List className="w-5 h-5" />
              View All Customers
            </button>
            <button
              onClick={() => handleTabChange("products")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === "products"
                  ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Package className="w-5 h-5" />
              Add Product
            </button>
          </div>

          <div className="p-6">
            {/* Message Alert */}
            {message.text && (
              <div
                className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
                  message.type === "error"
                    ? "bg-red-500 text-white border border-red-600"
                    : "bg-green-50 text-green-800 border border-green-200"
                }`}
              >
                {message.type === "error" ? (
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* Create Customer Tab (Fixed with single root element) */}
            {activeTab === "create" && (
              <div>
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Rate Limit:</strong> {remainingRequests} of{" "}
                    {MAX_REQUESTS} requests remaining this hour
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Age <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        name="phone_number"
                        value={formData.phone_number}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="+91 1234567890"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="customer@example.com"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <p className="text-sm font-semibold text-gray-700 mb-4">
                      ID Documents <span className="text-red-500">*</span> (At
                      least one required)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Aadhar ID
                        </label>
                        <input
                          type="text"
                          name="aadhar_id"
                          value={formData.aadhar_id}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="12 digits"
                          maxLength={12}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Passport ID
                        </label>
                        <input
                          type="text"
                          name="passport_id"
                          value={formData.passport_id}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          maxLength={50}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Driving License ID
                        </label>
                        <input
                          type="text"
                          name="driving_license_id"
                          value={formData.driving_license_id}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          maxLength={50}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Creating..." : "Create Customer"}
                  </button>
                </form>
              </div>
            )}

            {/* Search & Manage Tab (Fixed with single root element and closing tags) */}
            {activeTab === "search" && (
              <div>
                <form onSubmit={handleSearch} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Customer ID (10 digits)
                    </label>
                    <input
                      type="number"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter the 10-digit Customer ID"
                      maxLength={10}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Searching..." : "Search Customer"}
                  </button>
                </form>

                {searchResult && (
                  <div className="mt-8 border-t pt-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex justify-between items-center">
                      Customer Details (ID: {searchResult.customer_id})
                      <div className="flex gap-2">
                        <button
                          onClick={isEditing ? handleUpdateCustomer : startEdit}
                          disabled={loading}
                          className={`flex items-center gap-1 text-sm py-2 px-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            isEditing
                              ? "bg-green-500 text-white hover:bg-green-600"
                              : "bg-yellow-500 text-white hover:bg-yellow-600"
                          }`}
                        >
                          <Edit className="w-4 h-4" />
                          {isEditing ? "Save Changes" : "Edit Details"}
                        </button>

                        <button
                          onClick={() =>
                            handleDeleteCustomer(searchResult.customer_id)
                          }
                          disabled={loading}
                          className="flex items-center gap-1 bg-red-500 text-white text-sm py-2 px-3 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Customer
                        </button>
                      </div>
                    </h3>

                    {isEditing ? (
                      <div className="bg-yellow-50 rounded-lg p-6 space-y-3">
                        <h4 className="text-lg font-bold text-yellow-800 mb-4">
                          Editing Customer ID: {searchResult.customer_id}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Name
                            </label>
                            <input
                              type="text"
                              name="name"
                              value={editFormData.name}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Age
                            </label>
                            <input
                              type="number"
                              name="age"
                              value={editFormData.age}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              min="1"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Address
                          </label>
                          <textarea
                            name="address"
                            value={editFormData.address}
                            onChange={handleEditChange}
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Phone Number
                            </label>
                            <input
                              type="tel"
                              name="phone_number"
                              value={editFormData.phone_number}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Email
                            </label>
                            <input
                              type="email"
                              name="email"
                              value={editFormData.email}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Aadhar ID
                            </label>
                            <input
                              type="text"
                              name="aadhar_id"
                              value={editFormData.aadhar_id}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              maxLength={12}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Passport ID
                            </label>
                            <input
                              type="text"
                              name="passport_id"
                              value={editFormData.passport_id}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              maxLength={50}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Driving License ID
                            </label>
                            <input
                              type="text"
                              name="driving_license_id"
                              value={editFormData.driving_license_id}
                              onChange={handleEditChange}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              maxLength={50}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="mt-4 bg-gray-500 text-white py-2 px-4 rounded-lg hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-6 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-sm font-semibold text-gray-600">
                              Customer ID:
                            </span>
                            <p className="text-gray-900">
                              {searchResult.customer_id}
                            </p>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-gray-600">
                              Name:
                            </span>
                            <p className="text-gray-900">{searchResult.name}</p>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-gray-600">
                              Age:
                            </span>
                            <p className="text-gray-900">{searchResult.age}</p>
                          </div>
                          {searchResult.phone_number && (
                            <div>
                              <span className="text-sm font-semibold text-gray-600">
                                Phone:
                              </span>
                              <p className="text-gray-900">
                                {searchResult.phone_number}
                              </p>
                            </div>
                          )}
                          {searchResult.email && (
                            <div>
                              <span className="text-sm font-semibold text-gray-600">
                                Email:
                              </span>
                              <p className="text-gray-900">
                                {searchResult.email}
                              </p>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-600">
                            Address:
                          </span>
                          <p className="text-gray-900">
                            {searchResult.address}
                          </p>
                        </div>
                        <div className="border-t pt-3 mt-3">
                          <p className="text-sm font-semibold text-gray-600 mb-2">
                            ID Documents:
                          </p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {searchResult.aadhar_id && (
                              <div>
                                <span className="text-gray-600">Aadhar:</span>
                                <p className="font-medium">
                                  {searchResult.aadhar_id}
                                </p>
                              </div>
                            )}
                            {searchResult.passport_id && (
                              <div>
                                <span className="text-gray-600">Passport:</span>
                                <p className="font-medium">
                                  {searchResult.passport_id}
                                </p>
                              </div>
                            )}
                            {searchResult.driving_license_id && (
                              <div>
                                <span className="text-gray-600">
                                  Driving License:
                                </span>
                                <p className="font-medium">
                                  {searchResult.driving_license_id}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {products.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-lg font-bold text-gray-800 mb-3">
                          Products
                        </h4>
                        <div className="bg-white border rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Product
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Quantity
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Price
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Total
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {products.map((product) => (
                                <tr key={product.product_id}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {product.product_name}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {product.quantity}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ₹{product.price.toFixed(2)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                    ₹
                                    {(product.quantity * product.price).toFixed(
                                      2
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                      onClick={() =>
                                        handleDeleteProduct(
                                          product.customer_id,
                                          product.product_id
                                        )
                                      }
                                      disabled={loading}
                                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                      title="Delete Product"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* NEW: View All Customers Tab */}
            {activeTab === "viewAll" && (
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                  All Existing Customers ({allCustomers.length})
                </h3>
                {loading ? (
                  <p className="text-blue-600">Loading all customer data...</p>
                ) : allCustomers.length === 0 ? (
                  <p className="text-gray-500">
                    No customers found in the database. Create a customer in the
                    'Create Customer' tab.
                  </p>
                ) : (
                  <div className="bg-white border rounded-lg overflow-x-auto shadow-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Age
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Address
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ID Documents
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {allCustomers.map((customer) => (
                          <tr
                            key={customer.customer_id}
                            className="hover:bg-blue-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                              {customer.customer_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {customer.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {customer.age}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs">
                              {customer.address}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {(customer.aadhar_id ? "A: Yes" : "") +
                                (customer.passport_id ? " P: Yes" : "") +
                                (customer.driving_license_id ? " D: Yes" : "")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(
                                customer.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => {
                                  setSearchValue(
                                    customer.customer_id.toString()
                                  );
                                  handleTabChange("search");
                                }}
                                className="text-indigo-600 hover:text-indigo-900 text-sm"
                              >
                                View/Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Add Product Tab (Fixed with single root element) */}
            {activeTab === "products" && (
              <div>
                <form onSubmit={handleAddProduct} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Customer ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="customer_id"
                        value={productData.customer_id}
                        onChange={handleProductChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter 10-digit customer ID"
                        maxLength={10}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="product_name"
                        value={productData.product_name}
                        onChange={handleProductChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter product name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="quantity"
                        value={productData.quantity}
                        onChange={handleProductChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="1"
                        placeholder="Enter quantity"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Price (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="price"
                        value={productData.price}
                        onChange={handleProductChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        step="0.01"
                        min="0"
                        placeholder="Enter price"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Adding..." : "Add Product"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
