const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = path.join(__dirname, "data.json");

const initialData = {
    products: [
        {
            id: 1,
            name: "Tomato",
            price: 20,
            qty: 10,
            vendor: "Green Fresh Veggies",
            sold: 5,
            addedDate: "2026-10-27T09:00:00.000Z",
            expiryDate: "2026-10-31",
            category: "Daily Essentials",
            image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80"
        },
        {
            id: 2,
            name: "Potato",
            price: 30,
            qty: 15,
            vendor: "Lakshmi Vegetables",
            sold: 8,
            addedDate: "2026-10-29T10:00:00.000Z",
            expiryDate: "2026-11-15",
            category: "Root Vegetables",
            image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80"
        },
        {
            id: 3,
            name: "Onion",
            price: 25,
            qty: 2,
            vendor: "Green Fresh Veggies",
            sold: 0,
            addedDate: "2026-10-26T08:00:00.000Z",
            expiryDate: "2026-11-05",
            category: "Daily Essentials",
            image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&q=80"
        }
    ],
    enquiries: [],
    orders: [],
    users: []
};

// Helper to safely read database
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(initialData, null, 2)
        );
    }

    const data = JSON.parse(
        fs.readFileSync(DB_FILE, "utf8")
    );

    if (!Array.isArray(data.products)) data.products = [];
    if (!Array.isArray(data.enquiries)) data.enquiries = [];
    if (!Array.isArray(data.orders)) data.orders = [];
    if (!Array.isArray(data.users)) data.users = [];

    // Ensure all products have defaults
    for (const p of data.products) {
        if (!p.addedDate) p.addedDate = new Date(p.id || Date.now()).toISOString();
        if (p.sold === undefined) p.sold = 0;
        if (p.expiryDate === undefined) p.expiryDate = null;
        if (!p.category) p.category = "Vegetables";
        if (p.image === undefined) p.image = "";
    }

    // Ensure all enquiries have reply fields
    for (const e of data.enquiries) {
        if (e.reply === undefined) e.reply = "";
        if (e.replyDate === undefined) e.replyDate = null;
    }

    return data;
}

// Helper to save database
function writeDB(data) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
    );
}

// Backend Health Check
app.get("/api/health", (req, res) => {
    res.json({
        message: "Local Veggies backend is running"
    });
});

// ==========================================
// AUTHENTICATION ENDPOINTS (BCRYPT)
// ==========================================

// Register Customer or Vendor
app.post("/api/auth/register", (req, res) => {
    const { role, name, email, password, shopName, phone } = req.body;

    if (!role || !["customer", "vendor"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Role must be 'customer' or 'vendor'." });
    }

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (String(password).length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long." });
    }

    const finalShopName = role === "vendor" ? (shopName ? String(shopName).trim() : String(name).trim()) : undefined;

    const db = readDB();
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists. Please log in." });
    }

    const hashedPassword = bcrypt.hashSync(String(password), 10);

    const newUser = {
        id: Date.now(),
        role,
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: String(phone || "").trim(),
        shopName: finalShopName,
        createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDB(db);

    const safeUser = {
        id: newUser.id,
        role: newUser.role,
        name: newUser.name,
        email: newUser.email,
        shopName: newUser.shopName,
        phone: newUser.phone
    };

    res.status(201).json({
        message: `${role === "vendor" ? "Vendor" : "Customer"} registered successfully!`,
        user: safeUser
    });
});

// Login for Customer or Vendor
app.post("/api/auth/login", (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const db = readDB();
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = db.users.find(
        u => u.email.toLowerCase() === normalizedEmail
    );

    if (!user) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    let isMatch = false;
    try {
        if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
            isMatch = bcrypt.compareSync(String(password), user.password);
        } else {
            const sha256 = crypto.createHash("sha256").update(String(password)).digest("hex");
            if (user.password === sha256 || user.password === password) {
                isMatch = true;
                user.password = bcrypt.hashSync(String(password), 10);
                writeDB(db);
            }
        }
    } catch (e) {
        isMatch = false;
    }

    if (!isMatch) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    if (role && user.role !== role) {
        const targetPortal = user.role === "vendor" ? "Vendor Portal" : "Customer Portal";
        return res.status(403).json({
            error: `This account is registered as a ${user.role}. Please log in via the ${targetPortal}.`
        });
    }

    const safeUser = {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        shopName: user.shopName,
        phone: user.phone
    };

    res.json({
        message: "Login successful!",
        user: safeUser
    });
});

// ==========================================
// PRODUCT & UNSOLD / EXPIRY ALERT ENDPOINTS
// ==========================================

// Get and search vegetables (supports ?search=, ?vendor=, ?category=)
app.get("/api/products", (req, res) => {
    const db = readDB();
    const search = String(req.query.search || "").toLowerCase();
    const vendor = String(req.query.vendor || "").toLowerCase();
    const category = String(req.query.category || "").toLowerCase();

    let products = db.products;

    if (vendor) {
        products = products.filter(p => p.vendor.toLowerCase() === vendor);
    }

    if (category && category !== "all") {
        products = products.filter(p => (p.category || "").toLowerCase() === category);
    }

    if (search) {
        products = products.filter(product =>
            product.name.toLowerCase().includes(search) ||
            product.vendor.toLowerCase().includes(search) ||
            (product.category || "").toLowerCase().includes(search)
        );
    }

    res.json(products);
});

// Unsold & Expiry Alert Endpoint
app.get("/api/products/alerts", (req, res) => {
    const db = readDB();
    const vendor = String(req.query.vendor || "").toLowerCase();
    const now = new Date();

    let products = db.products;
    if (vendor) {
        products = products.filter(p => p.vendor.toLowerCase() === vendor);
    }

    const alerts = [];

    for (const p of products) {
        const added = p.addedDate ? new Date(p.addedDate) : new Date(p.id);
        const daysUnsold = Math.floor((now - added) / (1000 * 60 * 60 * 24));

        // 1. Unsold Alert: listed >= 2 days ago and still has stock remaining
        if (daysUnsold >= 2 && p.qty > 0) {
            alerts.push({
                type: "unsold",
                severity: daysUnsold >= 4 ? "danger" : "warning",
                productId: p.id,
                productName: p.name,
                vendor: p.vendor,
                daysUnsold,
                availableQty: p.qty,
                soldQty: p.sold || 0,
                price: p.price,
                category: p.category || "Vegetables",
                image: p.image || "",
                addedDate: added.toISOString(),
                message: `${p.name} has remained unsold for ${daysUnsold} day${daysUnsold === 1 ? '' : 's'} (${p.qty} kg remaining).`
            });
        }

        // 2. Expiry Alerts (if expiryDate entered and stock > 0)
        if (p.expiryDate && p.qty > 0) {
            const expiry = new Date(p.expiryDate + "T23:59:59");
            const diffHours = (expiry - now) / (1000 * 60 * 60);
            const diffDays = Math.ceil(diffHours / 24);

            if (diffHours < 0) {
                alerts.push({
                    type: "expired",
                    severity: "danger",
                    productId: p.id,
                    productName: p.name,
                    vendor: p.vendor,
                    expiryDate: p.expiryDate,
                    availableQty: p.qty,
                    price: p.price,
                    category: p.category || "Vegetables",
                    image: p.image || "",
                    message: `${p.name} has passed its expiry date (${p.expiryDate}) with ${p.qty} kg remaining!`
                });
            } else if (diffDays <= 2) {
                alerts.push({
                    type: "expiring_soon",
                    severity: "warning",
                    productId: p.id,
                    productName: p.name,
                    vendor: p.vendor,
                    daysUntilExpiry: diffDays,
                    expiryDate: p.expiryDate,
                    availableQty: p.qty,
                    price: p.price,
                    category: p.category || "Vegetables",
                    image: p.image || "",
                    message: `${p.name} is expiring soon (${diffDays === 0 ? "today" : "in " + diffDays + " day(s)"} on ${p.expiryDate}).`
                });
            }
        }
    }

    res.json(alerts);
});

// Add a new vegetable
app.post("/api/products", (req, res) => {
    const { name, price, qty, vendor, expiryDate, addedDate, category, image } = req.body;

    if (
        !name ||
        !vendor ||
        price === undefined ||
        qty === undefined ||
        !Number.isFinite(Number(price)) ||
        !Number.isFinite(Number(qty)) ||
        Number(price) < 0 ||
        Number(qty) < 0
    ) {
        return res.status(400).json({
            error: "Enter a valid vegetable name, vendor, price, and quantity."
        });
    }

    const db = readDB();

    const product = {
        id: Date.now(),
        name: String(name).trim(),
        price: Number(price),
        qty: Number(qty),
        vendor: String(vendor).trim(),
        sold: 0,
        category: category ? String(category).trim() : "Vegetables",
        image: image ? String(image).trim() : "",
        addedDate: addedDate ? new Date(addedDate).toISOString() : new Date().toISOString(),
        expiryDate: expiryDate ? String(expiryDate).trim() : null
    };

    db.products.push(product);
    writeDB(db);

    res.status(201).json(product);
});

// Update vegetable information (name, price, qty, category, image, expiryDate, sold)
// Requirement 7: Enforce vendor ownership verification
app.put("/api/products/:id", (req, res) => {
    const db = readDB();
    const product = db.products.find(
        item => item.id === Number(req.params.id)
    );

    if (!product) {
        return res.status(404).json({
            error: "Vegetable not found."
        });
    }

    // Ownership check: Ensure requesting vendor owns this vegetable
    const requestingVendor = String(req.body.vendorAuth || req.query.vendor || "").trim().toLowerCase();
    if (requestingVendor && product.vendor.toLowerCase() !== requestingVendor) {
        return res.status(403).json({
            error: "Access denied: You can only edit your own vegetables."
        });
    }

    const { name, price, qty, vendor, sold, expiryDate, addedDate, category, image } = req.body;

    if (name !== undefined) product.name = String(name).trim();
    if (category !== undefined) product.category = String(category).trim();
    if (image !== undefined) product.image = String(image).trim();
    if (expiryDate !== undefined) product.expiryDate = expiryDate ? String(expiryDate).trim() : null;
    if (addedDate !== undefined) product.addedDate = new Date(addedDate).toISOString();

    if (price !== undefined) {
        const val = Number(price);
        if (!Number.isFinite(val) || val < 0) {
            return res.status(400).json({ error: "Price must be a non-negative number." });
        }
        product.price = val;
    }

    if (qty !== undefined) {
        const val = Number(qty);
        if (!Number.isFinite(val) || val < 0) {
            return res.status(400).json({ error: "Quantity must be a non-negative number." });
        }
        product.qty = val;
    }

    if (sold !== undefined) {
        const val = Number(sold);
        if (!Number.isFinite(val) || val < 0) {
            return res.status(400).json({ error: "Sold must be a non-negative number." });
        }
        product.sold = val;
    }

    writeDB(db);
    res.json({ message: "Vegetable updated successfully!", product });
});

// Mark vegetable as sold (deducts from qty and increments sold)
app.post("/api/products/:id/mark-sold", (req, res) => {
    const db = readDB();
    const product = db.products.find(item => item.id === Number(req.params.id));

    if (!product) {
        return res.status(404).json({ error: "Vegetable not found." });
    }

    // Optional ownership check
    const requestingVendor = String(req.body.vendorAuth || req.query.vendor || "").trim().toLowerCase();
    if (requestingVendor && product.vendor.toLowerCase() !== requestingVendor) {
        return res.status(403).json({ error: "Access denied: You can only update your own vegetables." });
    }

    let sellQty = req.body.soldAmount !== undefined ? Number(req.body.soldAmount) : product.qty;

    if (!Number.isFinite(sellQty) || sellQty <= 0) {
        return res.status(400).json({ error: "Please enter a valid sold quantity greater than 0." });
    }

    if (sellQty > product.qty) {
        return res.status(400).json({
            error: `Cannot mark ${sellQty} kg as sold. Only ${product.qty} kg in stock.`
        });
    }

    product.qty -= sellQty;
    product.sold = (product.sold || 0) + sellQty;

    writeDB(db);
    res.json({
        message: `Successfully marked ${sellQty} kg of ${product.name} as sold!`,
        product
    });
});

// Delete a vegetable
// Requirement 4 & 7: Delete with vendor ownership check
app.delete("/api/products/:id", (req, res) => {
    const db = readDB();
    const product = db.products.find(item => item.id === Number(req.params.id));

    if (!product) {
        return res.status(404).json({
            error: "Vegetable not found."
        });
    }

    // Ownership check: Ensure requesting vendor owns this vegetable
    const requestingVendor = String(req.body.vendorAuth || req.query.vendor || "").trim().toLowerCase();
    if (requestingVendor && product.vendor.toLowerCase() !== requestingVendor) {
        return res.status(403).json({
            error: "Access denied: You can only delete your own vegetables."
        });
    }

    db.products = db.products.filter(item => item.id !== Number(req.params.id));
    writeDB(db);
    res.json({ message: "Vegetable deleted successfully." });
});

// ==========================================
// ENQUIRY ENDPOINTS
// ==========================================

// View customer enquiries (strictly scoped by ?vendor= or ?customer=)
// Requirements 5 & 6: Ensure customers and vendors see only their own enquiries
app.get("/api/enquiries", (req, res) => {
    const db = readDB();
    const vendorFilter = String(req.query.vendor || "").trim().toLowerCase();
    const customerFilter = String(req.query.customer || "").trim().toLowerCase();

    let enquiries = db.enquiries;

    if (vendorFilter) {
        enquiries = enquiries.filter(e =>
            e.vendor.toLowerCase() === vendorFilter
        );
        return res.json(enquiries);
    }

    if (customerFilter) {
        enquiries = enquiries.filter(e =>
            e.name.toLowerCase() === customerFilter
        );
        return res.json(enquiries);
    }

    // If neither role identifier is provided, return empty list to protect privacy
    res.json([]);
});

// Update enquiry status (Accept or Reject)
// Requirement 4: Allow vendors to accept or reject customer enquiries
// Requirement 6: Ensure vendors cannot modify enquiries belonging to other vendors
app.put("/api/enquiries/:id/status", (req, res) => {
    const db = readDB();
    const enquiry = db.enquiries.find(e => e.id === Number(req.params.id));

    if (!enquiry) {
        return res.status(404).json({ error: "Enquiry not found." });
    }

    const { status, vendorAuth } = req.body;
    const allowedStatuses = ["Accepted", "Rejected", "Pending"];

    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'Accepted' or 'Rejected'." });
    }

    const requestingVendor = String(vendorAuth || req.query.vendor || "").trim().toLowerCase();
    if (requestingVendor && enquiry.vendor.toLowerCase() !== requestingVendor) {
        return res.status(403).json({
            error: "Access denied: You can only update enquiries sent to your own shop."
        });
    }

    enquiry.status = status;
    writeDB(db);

    res.json({
        message: `Enquiry has been ${status.toLowerCase()}!`,
        enquiry
    });
});

// Reply to customer enquiry with a message (and optional status update)
app.put("/api/enquiries/:id/reply", (req, res) => {
    const db = readDB();
    const enquiry = db.enquiries.find(e => e.id === Number(req.params.id));

    if (!enquiry) {
        return res.status(404).json({ error: "Enquiry not found." });
    }

    const { reply, status, vendorAuth } = req.body;

    const requestingVendor = String(vendorAuth || req.query.vendor || "").trim().toLowerCase();
    if (requestingVendor && enquiry.vendor.toLowerCase() !== requestingVendor) {
        return res.status(403).json({
            error: "Access denied: You can only reply to enquiries sent to your own shop."
        });
    }

    if (reply !== undefined) {
        enquiry.reply = String(reply).trim();
        enquiry.replyDate = new Date().toISOString();
    }

    if (status && ["Accepted", "Rejected", "Pending"].includes(status)) {
        enquiry.status = status;
    }

    writeDB(db);

    res.json({
        message: "Reply sent to customer successfully!",
        enquiry
    });
});

// Add a customer enquiry
app.post("/api/enquiries", (req, res) => {
    const { name, product, vendor, qty, message } = req.body;

    if (
        !name || !product || !vendor ||
        !Number.isInteger(Number(qty)) ||
        Number(qty) < 1
    ) {
        return res.status(400).json({
            error: "Enter valid customer name, product, vendor, and quantity."
        });
    }

    const db = readDB();

    const enquiry = {
        id: Date.now(),
        name: String(name).trim(),
        product: String(product).trim(),
        vendor: String(vendor).trim(),
        qty: Number(qty),
        message: String(message || ""),
        status: "Pending",
        reply: "",
        replyDate: null,
        date: new Date().toISOString()
    };

    db.enquiries.push(enquiry);
    writeDB(db);

    res.status(201).json(enquiry);
});

// ==========================================
// VENDOR SHOP PROFILES & GOOGLE MAPS ENDPOINTS
// ==========================================

// Get all vendor shops with address, hours, maps links & product summary
app.get("/api/vendors", (req, res) => {
    const db = readDB();
    const vendorUsers = db.users.filter(u => u.role === "vendor");
    const vendorMap = new Map();

    // 1. Registered vendor users
    for (const u of vendorUsers) {
        const shop = u.shopName || u.name;
        const address = u.address || "Shop #12, Daily Veggie Market, Main Road";
        const openingHours = u.openingHours || "6:30 AM – 8:30 PM (Daily)";
        const mapsQuery = u.mapsQuery || `${shop} ${address}`;
        const vendorKey = shop.toLowerCase();

        vendorMap.set(vendorKey, {
            id: u.id,
            shopName: shop,
            ownerName: u.name,
            phone: u.phone || "Contact at stall",
            email: u.email,
            address: address,
            openingHours: openingHours,
            mapsQuery: mapsQuery,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
            productsCount: db.products.filter(p => p.vendor.toLowerCase() === vendorKey).length
        });
    }

    // 2. Fallback for any vendor names found in products but not explicitly in users table
    for (const p of db.products) {
        if (!p.vendor) continue;
        const vKey = p.vendor.toLowerCase();
        if (!vendorMap.has(vKey)) {
            const address = "Daily Farmers Market, Vegetable Section";
            const openingHours = "7:00 AM – 8:00 PM (Daily)";
            const mapsQuery = `${p.vendor} Vegetable Market`;
            vendorMap.set(vKey, {
                id: Date.now() + Math.random(),
                shopName: p.vendor,
                ownerName: p.vendor,
                phone: "Available at stall",
                email: "",
                address: address,
                openingHours: openingHours,
                mapsQuery: mapsQuery,
                mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
                productsCount: db.products.filter(item => item.vendor.toLowerCase() === vKey).length
            });
        }
    }

    res.json(Array.from(vendorMap.values()));
});

// Get single vendor shop profile and all vegetables they sell
app.get("/api/vendors/:name", (req, res) => {
    const db = readDB();
    const targetName = decodeURIComponent(req.params.name).trim().toLowerCase();

    const vendorUser = db.users.find(u =>
        u.role === "vendor" && (
            (u.shopName && u.shopName.toLowerCase() === targetName) ||
            u.name.toLowerCase() === targetName
        )
    );

    const products = db.products.filter(p => p.vendor.toLowerCase() === targetName);

    const shopName = vendorUser?.shopName || (products.length > 0 ? products[0].vendor : req.params.name);
    const address = vendorUser?.address || "Main Street Farmers Produce Bazaar";
    const openingHours = vendorUser?.openingHours || "6:30 AM – 8:30 PM (Daily)";
    const mapsQuery = vendorUser?.mapsQuery || `${shopName} ${address}`;

    res.json({
        shopName: shopName,
        ownerName: vendorUser ? vendorUser.name : shopName,
        phone: vendorUser?.phone || "Available at Stall",
        email: vendorUser?.email || "",
        address: address,
        openingHours: openingHours,
        mapsQuery: mapsQuery,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
        products: products
    });
});

// ==========================================
// CUSTOMER ORDERS & FULFILLMENT ENDPOINTS
// ==========================================

// Get customer orders (filtered by ?customer= or ?vendor=)
app.get("/api/orders", (req, res) => {
    const db = readDB();
    const customer = String(req.query.customer || "").trim().toLowerCase();
    const vendor = String(req.query.vendor || "").trim().toLowerCase();

    let orders = Array.isArray(db.orders) ? [...db.orders] : [];

    if (customer) {
        orders = orders.filter(o =>
            (o.customerEmail && o.customerEmail.toLowerCase() === customer) ||
            (o.customerName && o.customerName.toLowerCase() === customer)
        );
    } else if (vendor) {
        orders = orders.filter(o =>
            Array.isArray(o.items) && o.items.some(item => (item.vendor || "").toLowerCase() === vendor)
        );
    }

    // Sort newest orders first
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
});

// Place a new customer order (supports Shop Pickup or Home Delivery)
app.post("/api/orders", (req, res) => {
    const { customerName, customerEmail, customerPhone, fulfillmentType, deliveryAddress, items, notes } = req.body;

    if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Customer name and at least one item are required." });
    }

    const db = readDB();
    const orderItems = [];
    let itemsSubtotal = 0;

    // Validate products and check stock availability
    for (const reqItem of items) {
        const product = db.products.find(p => p.id === Number(reqItem.productId));
        if (!product) {
            return res.status(404).json({ error: `Vegetable #${reqItem.productId} was not found.` });
        }

        const qtyToBuy = Number(reqItem.qty);
        if (!Number.isFinite(qtyToBuy) || qtyToBuy <= 0) {
            return res.status(400).json({ error: `Please enter a valid quantity for ${product.name}.` });
        }

        if (product.qty < qtyToBuy) {
            return res.status(400).json({
                error: `Not enough stock for ${product.name}. Available: ${product.qty} kg, requested: ${qtyToBuy} kg.`
            });
        }

        const itemTotal = product.price * qtyToBuy;
        itemsSubtotal += itemTotal;

        orderItems.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: qtyToBuy,
            vendor: product.vendor,
            category: product.category || "Vegetables",
            image: product.image || "",
            itemTotal: itemTotal
        });
    }

    // Delivery vs Pickup fulfillment rules
    const isDelivery = fulfillmentType === "Home Delivery";
    // ₹30 delivery fee, or free delivery on orders >= ₹200
    const deliveryFee = isDelivery ? (itemsSubtotal >= 200 ? 0 : 30) : 0;
    const totalAmount = itemsSubtotal + deliveryFee;

    if (isDelivery && (!deliveryAddress || !String(deliveryAddress).trim())) {
        return res.status(400).json({ error: "Please enter your delivery address for Home Delivery." });
    }

    // Deduct stock and increment sold in db.products
    for (const item of orderItems) {
        const product = db.products.find(p => p.id === item.productId);
        if (product) {
            product.qty = Math.max(0, product.qty - item.qty);
            product.sold = (product.sold || 0) + item.qty;
        }
    }

    const orderNumber = "LV-" + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
        id: Date.now(),
        orderNumber: orderNumber,
        customerName: String(customerName).trim(),
        customerEmail: customerEmail ? String(customerEmail).trim().toLowerCase() : "",
        customerPhone: String(customerPhone || "").trim(),
        fulfillmentType: isDelivery ? "Home Delivery" : "Shop Pickup",
        deliveryAddress: isDelivery ? String(deliveryAddress).trim() : "Shop Pickup Counter (Collect at vendor stall)",
        items: orderItems,
        itemsSubtotal: itemsSubtotal,
        deliveryFee: deliveryFee,
        totalAmount: totalAmount,
        status: "Confirmed",
        notes: String(notes || "").trim(),
        createdAt: new Date().toISOString()
    };

    if (!Array.isArray(db.orders)) db.orders = [];
    db.orders.push(newOrder);
    writeDB(db);

    res.status(201).json({
        message: "Order placed successfully!",
        order: newOrder
    });
});

// Update order status (e.g., Placed -> Confirmed -> Ready for Pickup / Out for Delivery -> Delivered)
app.put("/api/orders/:id/status", (req, res) => {
    const db = readDB();
    const order = (db.orders || []).find(o => o.id === Number(req.params.id) || o.orderNumber === req.params.id);

    if (!order) {
        return res.status(404).json({ error: "Order not found." });
    }

    const { status } = req.body;
    const allowed = ["Placed", "Confirmed", "Ready for Pickup", "Out for Delivery", "Delivered", "Cancelled"];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ error: "Invalid status value." });
    }

    order.status = status;
    writeDB(db);

    res.json({ message: `Order status updated to ${status}.`, order });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Local Veggies running at http://localhost:${PORT}`);
});
