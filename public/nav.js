// Shared Navigation and User State Helper
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("localVeggiesUser"));
  } catch (e) {
    return null;
  }
}

function logoutUser() {
  localStorage.removeItem("localVeggiesUser");
  window.location.href = "index.html";
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function initNavigation(activePageKey) {
  const container = document.getElementById("header-nav-container");
  if (!container) return;

  const user = getCurrentUser();

  // 1. Top Auth Bar HTML
  let authBarHTML = "";
  if (!user) {
    authBarHTML = `
      <div class="auth-bar">
        <span>👋 Welcome to Local Veggies</span>
        <div class="auth-bar-actions">
          <a href="customer-auth.html" class="auth-pill">🛒 Customer Login / Register</a>
          <a href="vendor-auth.html" class="auth-pill vendor-pill">👨‍🌾 Vendor Portal</a>
        </div>
      </div>
    `;
  } else if (user.role === "vendor") {
    authBarHTML = `
      <div class="auth-bar">
        <span class="auth-bar-user">
          👨‍🌾 <strong>${escapeHTML(user.shopName || user.name)}</strong> (${escapeHTML(user.name)}) • <span class="badge badge-vendor">Vendor</span>
        </span>
        <div class="auth-bar-actions">
          <a href="vendor-dashboard.html" class="auth-pill">Dashboard</a>
          <button onclick="logoutUser()" class="btn btn-sm btn-danger" style="border-radius:16px;">Log Out</button>
        </div>
      </div>
    `;
  } else {
    authBarHTML = `
      <div class="auth-bar">
        <span class="auth-bar-user">
          🛒 <strong>${escapeHTML(user.name)}</strong> • <span class="badge badge-customer">Customer</span>
        </span>
        <div class="auth-bar-actions">
          <a href="customer-dashboard.html" class="auth-pill">My Account</a>
          <button onclick="logoutUser()" class="btn btn-sm btn-danger" style="border-radius:16px;">Log Out</button>
        </div>
      </div>
    `;
  }

  // 2. Main Navigation Links
  const navLinks = [
    { key: "home", label: "🏠 Home", url: user ? "home.html" : "index.html" },
    { key: "vegetables", label: "🥕 Available Vegetables", url: "vegetables.html" }
  ];

  if (!user) {
    navLinks.push(
      { key: "customer-auth", label: "🛒 Customer Access", url: "customer-auth.html" },
      { key: "vendor-auth", label: "👨‍🌾 Vendor Access", url: "vendor-auth.html" },
      { key: "enquiries", label: "📩 Enquiries", url: "enquiries.html" },
      { key: "sales", label: "📊 Sales Dashboard", url: "sales-dashboard.html" }
    );
  } else if (user.role === "vendor") {
    navLinks.push(
      { key: "vendor-dashboard", label: "📋 Vendor Dashboard", url: "vendor-dashboard.html" },
      { key: "manage-vegetables", label: "➕ Add/Edit Vegetables", url: "manage-vegetables.html" },
      { key: "enquiries", label: "📩 Customer Enquiries", url: "enquiries.html" },
      { key: "sales", label: "📊 Sales Dashboard", url: "sales-dashboard.html" }
    );
  } else if (user.role === "customer") {
    navLinks.push(
      { key: "customer-dashboard", label: "👤 Customer Dashboard", url: "customer-dashboard.html" },
      { key: "enquiries", label: "📩 My Enquiries", url: "enquiries.html" },
      { key: "sales", label: "📊 Market Overview", url: "sales-dashboard.html" }
    );
  }

  const linksHTML = navLinks.map(l =>
    `<a href="${l.url}" class="${l.key === activePageKey ? 'active' : ''}">${l.label}</a>`
  ).join("");

  container.innerHTML = `
    <header>
      <h1>🌱 Local Veggies</h1>
      <p>Fresh Produce Direct from Local Vendors & Farmers</p>
    </header>
    ${authBarHTML}
    <nav>
      ${linksHTML}
    </nav>
  `;
}
