const BACKEND_URL = "http://localhost:5002/api";

document.addEventListener("DOMContentLoaded", function () {
    console.log("🔹 JavaScript Loaded Successfully!");

    const authPage = document.getElementById("authPage");
    const uploadPage = document.getElementById("uploadPage");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const fileInput = document.getElementById("fileInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const fileDisplay = document.getElementById("fileDisplay");
    const categoryBtn = document.getElementById("categoryBtn");
    const categoryDropdown = document.getElementById("categoryDropdown");
    let selectedCategory = "all";

    // ✅ Handle Login
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = loginForm.querySelector("input[type='email']").value;
        const password = loginForm.querySelector("input[type='password']").value;

        try {
            const response = await fetch(`${BACKEND_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (data.token) {
                localStorage.setItem("token", data.token);
                authPage.classList.add("hidden");
                uploadPage.classList.remove("hidden");
                loadFiles(); // Ensure files load after login
            } else {
                alert("❌ Invalid login credentials.");
            }
        } catch (error) {
            console.error("❌ Login failed:", error);
        }
    });

    // ✅ Handle Category Dropdown Toggle
    categoryBtn.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent immediate close
        categoryDropdown.classList.toggle("hidden");
    });

    // ✅ Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
        if (!categoryBtn.contains(event.target) && !categoryDropdown.contains(event.target)) {
            categoryDropdown.classList.add("hidden");
        }
    });

    // ✅ Handle Category Selection
    categoryDropdown.addEventListener("click", (event) => {
        if (event.target.dataset.category) {
            selectedCategory = event.target.dataset.category;
            categoryBtn.textContent = `Category: ${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}`;
            loadFiles(); // Reload files based on selected category
        }
    });

    // ✅ Handle File Upload
    uploadBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];

        if (!file) {
            alert("⚠️ Please select a file to upload.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", selectedCategory);

        try {
            await fetch(`${BACKEND_URL}/upload`, {
                method: "POST",
                body: formData
            });

            alert("✅ File uploaded successfully!");
            fileInput.value = "";
            loadFiles(); // Refresh file list after upload
        } catch (error) {
            console.error("❌ Upload error:", error);
        }
    });

    // ✅ Load Files (Filtered by Category)
    async function loadFiles() {
        try {
            let url = `${BACKEND_URL}/files`;
            if (selectedCategory !== "all") {
                url = `${BACKEND_URL}/files/${selectedCategory}`;
            }

            const response = await fetch(url);
            const files = await response.json();

            fileDisplay.innerHTML = "";

            if (files.length === 0) {
                fileDisplay.innerHTML = `<p class="text-gray-500 text-sm">No files in this category.</p>`;
            } else {
                files.forEach(file => {
                    const fileElement = document.createElement("div");
                    fileElement.classList.add("bg-white", "shadow-md", "p-3", "rounded-lg", "text-center", "w-48");

                    fileElement.innerHTML = `
                        <p class="text-gray-700 text-xs truncate w-full">${file.filename}</p>
                        <div class="mt-2 flex justify-center gap-2">
                            <a href="${BACKEND_URL}/file/${file.id}" target="_blank" class="text-blue-600 text-xs">🔗 View</a>
                            <button class="text-red-600 text-xs delete-btn" data-id="${file.id}">🗑 Delete</button>
                        </div>
                    `;

                    fileDisplay.appendChild(fileElement);
                });

                // Attach event listeners to delete buttons
                document.querySelectorAll(".delete-btn").forEach(button => {
                    button.addEventListener("click", async (event) => {
                        const fileId = event.target.dataset.id;
                        await deleteFile(fileId);
                    });
                });
            }
        } catch (error) {
            console.error("❌ Error loading files:", error);
        }
    }

    // ✅ Handle File Deletion
    async function deleteFile(fileId) {
        try {
            const response = await fetch(`${BACKEND_URL}/file/${fileId}`, { method: "DELETE" });

            if (response.ok) {
                alert("✅ File deleted successfully.");
                loadFiles(); // Refresh file list after deletion
            } else {
                alert("❌ Failed to delete file.");
            }
        } catch (error) {
            console.error("❌ Error deleting file:", error);
        }
    }

    loadFiles(); // Load files on page load
});
