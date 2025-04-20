const BACKEND_URL = "http://localhost:5002/api";

// Store the currently selected category (default to "all")
let currentCategory = "all";

document.addEventListener("DOMContentLoaded", function () {
    console.log("🔹 JavaScript Loaded Successfully!");

    // --- References for auth and file management ---
    const navBar = document.getElementById("navBar");
    const toolbar = document.getElementById("toolbar");
    const authPage = document.getElementById("authPage");
    const uploadPage = document.getElementById("uploadPage");

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
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
                    navBar.classList.remove("hidden");
                    toolbar.classList.remove("hidden");
                    uploadPage.classList.remove("hidden");
                    loadFiles();
                    // Show welcome screen after login
                    const welcomeScreen = document.getElementById("welcomeScreen");
                    if (welcomeScreen) {
                        welcomeScreen.style.display = "flex";
                        setTimeout(() => {
                            welcomeScreen.classList.add("opacity-0");
                            setTimeout(() => {
                                welcomeScreen.style.display = "none";
                                welcomeScreen.classList.remove("opacity-0");
                            }, 1000);
                        }, 1000);
                    }
                } else {
                    showNotification("❌ Invalid login credentials.", "error");
                }
            } catch (error) {
                console.error("❌ Login failed:", error);
            }
        });
    }

    // Logout button (navbar)
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            console.log("Logout button clicked (navbar).");
            // Clear token
            localStorage.removeItem("token");

            // Immediately update UI: Hide logged-in elements, show authentication page
            authPage.classList.remove("hidden");
            uploadPage.classList.add("hidden");
            navBar.classList.add("hidden");
            toolbar.classList.add("hidden");

            // Clear login form fields
            const loginForm = document.getElementById("loginForm");
            if (loginForm) {
                loginForm.reset();
            }

            // Now, show the goodbye screen over the login view
            const goodbyeScreen = document.getElementById("goodbyeScreen");
            if (goodbyeScreen) {
                goodbyeScreen.style.display = "flex";
                // Wait briefly before starting the fade out (this duration is adjustable)
                setTimeout(() => {
                    goodbyeScreen.classList.add("opacity-0");
                    // After fade out is complete, hide the overlay and remove the opacity class
                    setTimeout(() => {
                        goodbyeScreen.style.display = "none";
                        goodbyeScreen.classList.remove("opacity-0");
                    }, 1000);
                }, 1000);
            }

            showNotification("You have been logged out.", "info");
        });
    }

// Logout button (account panel)
    const logoutPanelBtn = document.getElementById("logoutPanelBtn");
    if (logoutPanelBtn) {
        logoutPanelBtn.addEventListener("click", () => {
            console.log("Logout button clicked (account panel).");
            localStorage.removeItem("token");

            // Immediately update UI to the logged-out state
            authPage.classList.remove("hidden");
            uploadPage.classList.add("hidden");
            navBar.classList.add("hidden");
            toolbar.classList.add("hidden");

            // Clear login fields if any
            const loginForm = document.getElementById("loginForm");
            if (loginForm) {
                loginForm.reset();
            }

            // Display and then fade out the goodbye screen on top of the login page
            const goodbyeScreen = document.getElementById("goodbyeScreen");
            if (goodbyeScreen) {
                goodbyeScreen.style.display = "flex";
                setTimeout(() => {
                    goodbyeScreen.classList.add("opacity-0");
                    setTimeout(() => {
                        goodbyeScreen.style.display = "none";
                        goodbyeScreen.classList.remove("opacity-0");
                    }, 1000);
                }, 1000);
            }

            showNotification("You have been logged out.", "info");
        });
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("registerEmail").value;
            const password = document.getElementById("registerPassword").value;
            const registerCode = document.getElementById("registerCode").value;
            try {
                const response = await fetch(`${BACKEND_URL}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, registerCode })
                });
                const data = await response.json();
                if (response.ok) {
                    showNotification("✅ Registration successful! Please log in.", "success");
                    document.getElementById("registerSection").classList.add("hidden");
                    document.getElementById("loginSection").classList.remove("hidden");
                } else {
                    showNotification(`❌ Registration failed: ${data.error}`, "error");
                }
            } catch (error) {
                console.error("❌ Registration error:", error);
            }
        });
    }

    const showRegister = document.getElementById("showRegister");
    if (showRegister) {
        showRegister.addEventListener("click", () => {
            document.getElementById("loginSection").classList.add("hidden");
            document.getElementById("registerSection").classList.remove("hidden");
        });
    }

    const backToLogin = document.getElementById("backToLogin");
    if (backToLogin) {
        backToLogin.addEventListener("click", () => {
            document.getElementById("registerSection").classList.add("hidden");
            document.getElementById("loginSection").classList.remove("hidden");
        });
    }

    // --- Account Panel & Dropdown ---
    const accountBtn = document.getElementById("accountBtn");
    const accountPanel = document.getElementById("accountPanel");
    const closeAccountPanel = document.getElementById("closeAccountPanel");
    if (accountBtn && accountPanel) {
        accountBtn.addEventListener("click", () => {
            accountPanel.classList.toggle("open");
        });
    }
    if (closeAccountPanel) {
        closeAccountPanel.addEventListener("click", () => {
            accountPanel.classList.remove("open");
        });
    }

    // Account dropdown inside navbar
    const accountDropdown = document.getElementById("accountDropdown");
    if (accountBtn && accountDropdown) {
        accountBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            accountDropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", (e) => {
            if (!accountBtn.contains(e.target) && !accountDropdown.contains(e.target)) {
                accountDropdown.classList.add("hidden");
            }
        });
    }

    // --- Reset Password Modal ---
    const resetPasswordBtn = document.getElementById("resetPasswordBtn");
    const resetPasswordModal = document.getElementById("resetPasswordModal");
    const closeResetModal = document.getElementById("closeResetModal");
    if (resetPasswordBtn && resetPasswordModal) {
        resetPasswordBtn.addEventListener("click", () => {
            accountPanel.classList.remove("open");
            resetPasswordModal.classList.remove("hidden");
        });
    }
    if (closeResetModal) {
        closeResetModal.addEventListener("click", () => {
            resetPasswordModal.classList.add("hidden");
        });
    }
    const resetPasswordForm = document.getElementById("resetPasswordForm");
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById("oldPassword").value;
            const newPassword = document.getElementById("newPassword").value;
            const confirmNewPassword = document.getElementById("confirmNewPassword").value;
            if (newPassword !== confirmNewPassword) {
                showNotification("❌ New passwords do not match.", "error");
                return;
            }
            try {
                const response = await fetch(`${BACKEND_URL}/reset-password`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + localStorage.getItem("token")
                    },
                    body: JSON.stringify({ oldPassword, newPassword })
                });
                const data = await response.json();
                if (response.ok) {
                    showNotification("✅ Password reset successfully.", "success");
                    resetPasswordModal.classList.add("hidden");
                } else {
                    showNotification(`❌ Reset failed: ${data.error}`, "error");
                }
            } catch (error) {
                console.error("❌ Reset password error:", error);
            }
        });
    }

    // --- Audit Modal ---
    const auditBtn = document.getElementById("auditBtn");
    const auditModal = document.getElementById("auditModal");
    const closeAuditModal = document.getElementById("closeAuditModal");
    const closeAuditModalTop = document.getElementById("closeAuditModalTop");
    if (auditBtn && auditModal) {
        auditBtn.addEventListener("click", async () => {
            accountPanel.classList.remove("open");
            auditModal.classList.remove("hidden");
            loadAuditLogs();
        });
    }
    if (closeAuditModal) {
        closeAuditModal.addEventListener("click", () => {
            auditModal.classList.add("hidden");
        });
    }
    if (closeAuditModalTop) {
        closeAuditModalTop.addEventListener("click", () => {
            auditModal.classList.add("hidden");
        });
    }

    // --- Failed Uploads Modal ---
    const failedUploadsBtn = document.getElementById("failedUploadsBtn");
    const failedUploadsModal = document.getElementById("failedUploadsModal");
    const closeFailedUploadsModal = document.getElementById("closeFailedUploadsModal");
    if (failedUploadsBtn && failedUploadsModal) {
        failedUploadsBtn.addEventListener("click", () => {
            accountPanel.classList.remove("open");
            failedUploadsModal.classList.remove("hidden");
            fetchFailedUploads();
        });
    }
    if (closeFailedUploadsModal) {
        closeFailedUploadsModal.addEventListener("click", () => {
            failedUploadsModal.classList.add("hidden");
        });
    }

    // --- Upload Modal ---
    const openUploadModalBtn = document.getElementById("uploadBtn");
    const uploadModal = document.getElementById("uploadModal");
    const closeUploadModal = document.getElementById("closeUploadModal");
    if (openUploadModalBtn && uploadModal) {
        openUploadModalBtn.addEventListener("click", () => {
            uploadModal.classList.remove("hidden");
        });
    }
    if (closeUploadModal) {
        closeUploadModal.addEventListener("click", () => {
            uploadModal.classList.add("hidden");
        });
    }
    const modalUploadBtn = document.getElementById("modalUploadBtn");
    if (modalUploadBtn) {
        modalUploadBtn.addEventListener("click", async () => {
            const modalFileInput = document.getElementById("modalFileInput");
            if (!modalFileInput.files.length) {
                showNotification("⚠️ Please select at least one file to upload.", "error");
                return;
            }
            const modalScheduledTime = document.getElementById("modalScheduledTime");

            // Separate valid PDF files from non-PDF files.
            let validFiles = [];
            let invalidFiles = [];
            Array.from(modalFileInput.files).forEach(file => {
                const isPDF = (file.type === "application/pdf") || file.name.toLowerCase().endsWith(".pdf");
                if (isPDF) {
                    validFiles.push(file);
                } else {
                    invalidFiles.push(file);
                }
            });

            // Log each invalid file as a failed upload.
            for (const file of invalidFiles) {
                try {
                    await fetch(`${BACKEND_URL}/failed-upload`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + localStorage.getItem("token")
                        },
                        body: JSON.stringify({
                            fileName: file.name,
                            errorMessage: "Invalid file type. Only PDF files are accepted."
                        })
                    });
                } catch (error) {
                    console.error("❌ Error logging failed upload:", error);
                }
            }

            // Immediately close the upload modal so the user can see the notification.
            const uploadModal = document.getElementById("uploadModal");
            uploadModal.classList.add("hidden");

            // If there are no valid PDF files, notify the user and exit.
            if (validFiles.length === 0) {
                showNotification("❌ No valid PDF files selected. Invalid files have been logged as failed uploads.", "error");
                return;
            } else if (invalidFiles.length > 0) {
                showNotification("⚠️ Some files were invalid and have been logged as failed uploads.", "error");
            }

            // Continue processing valid files.
            const formData = new FormData();
            validFiles.forEach(file => {
                formData.append("files", file);
            });
            if (modalScheduledTime && modalScheduledTime.value) {
                formData.append("scheduledTime", modalScheduledTime.value);
            }

            try {
                const response = await fetch(`${BACKEND_URL}/upload`, {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
                    body: formData
                });
                const data = await response.json();
                if (response.ok) {
                    showNotification(data.message || "✅ Files uploaded successfully!", "success");
                    modalFileInput.value = "";
                    modalScheduledTime.value = "";
                    setTimeout(loadFiles, 1000);
                } else {
                    showNotification(`❌ Upload failed: ${data.error}`, "error");
                }
            } catch (error) {
                console.error("❌ Upload error:", error);
            }
        });
    }

    // --- Category Dropdown ---
    const categoryBtn = document.getElementById("categoryBtn");
    const categoryDropdown = document.getElementById("categoryDropdown");
    if (categoryBtn && categoryDropdown) {
        // Clicking the category button toggles the dropdown
        categoryBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (categoryDropdown.classList.contains("hidden")) {
                categoryDropdown.classList.remove("hidden");
                categoryDropdown.classList.add("show");
            } else {
                categoryDropdown.classList.remove("show");
                categoryDropdown.classList.add("hidden");
            }
        });
        // Clicking anywhere outside closes the dropdown
        document.addEventListener("click", (event) => {
            if (!categoryBtn.contains(event.target) && !categoryDropdown.contains(event.target)) {
                categoryDropdown.classList.remove("show");
                categoryDropdown.classList.add("hidden");
            }
        });
        // When a category is clicked, update the currentCategory variable, update button text, hide the dropdown, and reload files.
        categoryDropdown.addEventListener("click", (event) => {
            if (event.target.dataset.category) {
                console.log("Category clicked:", event.target.dataset.category);
                currentCategory = event.target.dataset.category;
                categoryBtn.textContent = `Category: ${currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)}`;
                categoryDropdown.classList.remove("show");
                categoryDropdown.classList.add("hidden");
                loadFiles();
            }
        });
    }

    // --- Sorting ---
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", () => {
            loadFiles();
        });
    }

    // --- Load Files (Table) ---
    async function loadFiles() {
        try {
            let url;
            if (currentCategory === "all") {
                url = `${BACKEND_URL}/files`;
            } else {
                url = `${BACKEND_URL}/files/${currentCategory}`;
            }
            console.log("Fetching files from:", url);
            const response = await fetch(url);
            let files = await response.json();
            console.log("Files returned:", files);
            if (sortSelect) {
                const sortValue = sortSelect.value;
                if (sortValue === "name") {
                    files.sort((a, b) => a.filename.localeCompare(b.filename));
                } else if (sortValue === "date") {
                    files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
                }
            }
            const fileDisplayBody = document.getElementById("fileDisplayBody");
            if (fileDisplayBody) {
                fileDisplayBody.innerHTML = "";
                if (files.length === 0) {
                    const noFilesRow = document.createElement("tr");
                    noFilesRow.innerHTML = `<td colspan="3" class="px-4 py-3 text-gray-500 text-center">No files in this category.</td>`;
                    fileDisplayBody.appendChild(noFilesRow);
                } else {
                    files.forEach(file => {
                        const row = document.createElement("tr");
                        row.classList.add("border-b", "hover:bg-blue-100", "cursor-pointer");
                        row.innerHTML = `
                          <td class="px-4 py-3 truncate">${file.filename}</td>
                          <td class="px-4 py-3">${new Date(file.uploadDate).toLocaleString()}</td>
                          <td class="px-4 py-3 text-right space-x-2">
                            <button class="rename-btn text-blue-600 hover:underline" data-id="${file.id}" data-filename="${file.filename}">Rename</button>
                            <button class="delete-btn text-red-600 hover:underline" data-id="${file.id}">Delete</button>
                          </td>
                        `;
                        row.addEventListener("click", () => {
                            window.open(`${BACKEND_URL}/file/${file.id}`, "_blank");
                        });
                        const renameBtn = row.querySelector(".rename-btn");
                        if (renameBtn) {
                            renameBtn.addEventListener("click", (event) => {
                                event.stopPropagation();
                                const fileId = event.target.dataset.id;
                                const currentName = event.target.getAttribute("data-filename");
                                const newName = prompt("Enter new file name:", currentName);
                                if (newName && newName.trim() !== "" && newName !== currentName) {
                                    renameFile(fileId, newName);
                                }
                            });
                        }
                        const deleteBtn = row.querySelector(".delete-btn");
                        if (deleteBtn) {
                            deleteBtn.addEventListener("click", (event) => {
                                event.stopPropagation();
                                const fileId = event.target.dataset.id;
                                deleteFile(fileId);
                            });
                        }
                        fileDisplayBody.appendChild(row);
                    });
                }
            }
        } catch (error) {
            console.error("❌ Error loading files:", error);
        }
    }

    // --- Rename File ---
    async function renameFile(fileId, newName) {
        try {
            const response = await fetch(`${BACKEND_URL}/rename/${fileId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + localStorage.getItem("token")
                },
                body: JSON.stringify({ newFilename: newName })
            });
            if (response.ok) {
                showNotification("File renamed successfully", "success");
                loadFiles();
            } else {
                const data = await response.json();
                showNotification("❌ Rename failed: " + data.error, "error");
            }
        } catch (error) {
            console.error("❌ Error renaming file:", error);
        }
    }

    // --- Delete File ---
    async function deleteFile(fileId) {
        try {
            const response = await fetch(`${BACKEND_URL}/file/${fileId}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
            });
            if (response.ok) {
                showNotification("✅ File deleted successfully.", "success");
                loadFiles();
            } else {
                showNotification("❌ Failed to delete file.", "error");
            }
        } catch (error) {
            console.error("❌ Error deleting file:", error);
        }
    }

    // --- Functions for Failed Uploads ---
    async function fetchFailedUploads() {
        try {
            const response = await fetch(`${BACKEND_URL}/failed-uploads`, {
                headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
            });
            const uploads = await response.json();
            renderFailedUploads(uploads);
        } catch (error) {
            console.error("Error fetching failed uploads:", error);
        }
    }

    function renderFailedUploads(uploads) {
        const container = document.getElementById("failedUploadsContent");
        container.innerHTML = "";
        if (uploads.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-sm">No failed uploads!</p>`;
        } else {
            uploads.forEach(upload => {
                const uploadDiv = document.createElement("div");
                uploadDiv.classList.add("p-2", "bg-gray-100", "dark:bg-gray-700", "rounded", "mb-2", "flex", "justify-between", "items-center");

                const info = document.createElement("div");
                info.innerHTML = `
                <p class="font-bold">${upload.fileName}</p>
                <p class="text-xs">${new Date(upload.timestamp).toLocaleString()}</p>
                <p class="text-xs text-red-600">${upload.errorMessage}</p>
            `;

                // Create a container for the buttons.
                const btnContainer = document.createElement("div");
                btnContainer.classList.add("flex", "space-x-2");

                // Retry button
                const retryBtn = document.createElement("button");
                retryBtn.textContent = "Retry";
                retryBtn.classList.add("bg-blue-600", "text-white", "px-2", "py-1", "rounded", "text-sm", "hover:bg-blue-700", "dark:hover:bg-blue-500");
                retryBtn.addEventListener("click", () => retryFailedUpload(upload._id));

                // Cancel button
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "Cancel";
                cancelBtn.classList.add("bg-gray-600", "text-white", "px-2", "py-1", "rounded", "text-sm", "hover:bg-gray-700", "dark:hover:bg-gray-500");
                cancelBtn.addEventListener("click", () => cancelFailedUpload(upload._id));

                // Append buttons to the container.
                btnContainer.appendChild(retryBtn);
                btnContainer.appendChild(cancelBtn);

                uploadDiv.appendChild(info);
                uploadDiv.appendChild(btnContainer);
                container.appendChild(uploadDiv);
            });
        }
    }

    async function cancelFailedUpload(failedUploadId) {
        try {
            const response = await fetch(`${BACKEND_URL}/failed-upload/${failedUploadId}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
            });
            if (response.ok) {
                showNotification("Failed upload record removed.", "success");
                fetchFailedUploads(); // Refresh the list after deletion.
            } else {
                const data = await response.json();
                showNotification("❌ Failed to cancel: " + data.error, "error");
            }
        } catch (error) {
            console.error("Error cancelling failed upload:", error);
        }
    }


    async function retryFailedUpload(failedUploadId) {
        try {
            const response = await fetch(`${BACKEND_URL}/reupload/${failedUploadId}`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
            });
            if (response.ok) {
                showNotification("Reupload initiated.", "success");
                fetchFailedUploads();
            } else {
                const data = await response.json();
                showNotification("Failed to retry: " + data.error, "error");
            }
        } catch (error) {
            console.error("Error retrying failed upload:", error);
        }
    }

    // --- Notification Function ---
    function showNotification(message, type = 'success') {
        const toast = document.createElement('div');
        let bgColor;
        switch (type) {
            case 'success':
                bgColor = 'bg-green-500';
                break;
            case 'error':
                bgColor = 'bg-red-500';
                break;
            case 'info':
                bgColor = 'bg-blue-500';
                break;
            default:
                bgColor = 'bg-gray-500';
        }
        toast.className = `px-4 py-2 ${bgColor} text-white rounded shadow-lg opacity-0 transition-opacity duration-1000`;
        toast.textContent = message;
        const container = document.getElementById('toast-container');
        if (container) {
            container.appendChild(toast);
        } else {
            document.body.appendChild(toast);
        }
        setTimeout(() => {
            toast.classList.remove('opacity-0');
        }, 10);
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                toast.remove();
            }, 1000);
        }, 3000);
    }

    // --- Load Audit Logs ---
    async function loadAuditLogs() {
        try {
            const response = await fetch(`${BACKEND_URL}/audit`, {
                headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
            });
            const logs = await response.json();
            const auditContent = document.getElementById("auditContent");
            if (auditContent) {
                auditContent.innerHTML = "";
                if (logs.length === 0) {
                    auditContent.innerHTML = `<p class="text-gray-500 text-sm">No audit logs found.</p>`;
                } else {
                    logs.forEach(log => {
                        const logElement = document.createElement("div");
                        logElement.classList.add("p-2", "border-b", "text-xs");
                        logElement.innerHTML = `
                          <p><strong>File:</strong> ${log.fileName}</p>
                          <p><strong>Action:</strong> ${log.action}</p>
                          <p><strong>Status:</strong> ${log.status}</p>
                          <p><strong>Time:</strong> ${new Date(log.timestamp).toLocaleString()}</p>
                          <p><strong>User:</strong> ${log.user || "Unknown"}</p>
                        `;
                        auditContent.appendChild(logElement);
                    });
                }
            }
        } catch (error) {
            console.error("❌ Error loading audit logs:", error);
            const auditContent = document.getElementById("auditContent");
            if (auditContent) {
                auditContent.innerHTML = `<p class="text-red-600 text-sm">Failed to load audit logs.</p>`;
            }
        }
    }
});