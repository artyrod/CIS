const BACKEND_URL = "http://localhost:5002/api";

document.addEventListener("DOMContentLoaded", function () {
    const uploadPage = document.getElementById("uploadPage");
    const logoutBtn = document.getElementById("logoutBtn");
    const categoryBtn = document.getElementById("categoryBtn");
    const categoryDropdown = document.getElementById("categoryDropdown");
    const accountBtn = document.getElementById("accountBtn");
    const accountDropdown = document.getElementById("accountDropdown");
    const viewAccount = document.getElementById("viewAccount");

    // ✅ Toggle Category Dropdown
    categoryBtn.addEventListener("click", () => {
        categoryDropdown.classList.toggle("hidden");
    });

    // ✅ Filter Files by Category
    document.querySelectorAll("#categoryDropdown button").forEach(btn => {
        btn.addEventListener("click", (event) => {
            const category = event.target.dataset.category;
            console.log("Filtering by:", category);
        });
    });

    // ✅ Toggle Account Dropdown
    accountBtn.addEventListener("click", () => {
        accountDropdown.classList.toggle("hidden");
    });

    // ✅ View Account
    viewAccount.addEventListener("click", () => {
        window.location.href = "account.html";
    });

    // ✅ Logout
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("token");
        location.reload();
    });

    // ✅ Auto-Login if Token Exists
    if (localStorage.getItem("token")) {
        uploadPage.classList.remove("hidden");
    }
});
