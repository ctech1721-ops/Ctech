const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const KEY = "worknest_v1";


// ================= FASTAPI BACKEND =================

const API_BASE = "";

let backendReady = false;
let backendSyncBusy = false;
let backendSyncQueued = false;
let backendSyncPromise = Promise.resolve();
let serverSnapshot = null;

async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data = null;

    try {
        data = await response.json();
    } catch (_) {
        data = null;
    }

    if (!response.ok) {
        const message =
            data?.detail ||
            data?.message ||
            `Backend request failed (${response.status})`;
        throw new Error(message);
    }

    return data;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeBackendData(data) {
    const localCache = loadDB();
    const localUsersByEmail = new Map(
        localCache.users.map(u => [
            String(u.email || "").toLowerCase(),
            u
        ])
    );

    const users = (Array.isArray(data.users) ? data.users : []).map(u => {
        const local = localUsersByEmail.get(
            String(u.email || "").toLowerCase()
        );

        return {
            ...u,
            active: u.active !== false && u.active !== "false",
            photo: u.photo || "",
            documents: local?.documents || {}
        };
    });

    return {
        users,
        projects: (Array.isArray(data.projects) ? data.projects : []).map(p => ({
            ...p,
            startDate: p.startDate || "",
            due: p.due || p.dueDate || "",
            dueDate: p.dueDate || p.due || "",
            members: Array.isArray(p.members) ? p.members : [],
            completedAt: p.completedAt || "",
            completedBy: p.completedBy || "",
            completedByName: p.completedByName || "",
            memberSnapshots: Array.isArray(p.memberSnapshots)
                ? p.memberSnapshots
                : []
        })),
        tasks: (Array.isArray(data.tasks) ? data.tasks : []).map(t => ({
            ...t,
            project: t.project || t.projectId || "",
            projectId: t.projectId || t.project || "",
            assignee: t.assignee || t.assigneeId || t.employeeId || "",
            assigneeId: t.assigneeId || t.assignee || t.employeeId || "",
            employeeId: t.employeeId || t.assignee || t.assigneeId || "",
            due: t.due || t.dueDate || "",
            dueDate: t.dueDate || t.due || "",
            status: t.status || "To Do"
        })),
        reports: Array.isArray(data.reports) ? data.reports : [],
        leaves: Array.isArray(data.leaves) ? data.leaves : [],
        announcements: (Array.isArray(data.announcements) ? data.announcements : []).map(a => ({
            ...a,
            body: a.body || a.message || "",
            message: a.message || a.body || "",
            by: a.by || a.createdBy || "",
            date: a.date || (a.createdAt ? String(a.createdAt).slice(0, 10) : "")
        }))
    };
}

async function fetchBackendData() {
    const [users, projects, tasks, reports, leaves, announcements] =
        await Promise.all([
            api("/api/employees"),
            api("/api/projects"),
            api("/api/tasks"),
            api("/api/reports"),
            api("/api/leaves"),
            api("/api/announcements")
        ]);

    const data = normalizeBackendData({
        users,
        projects,
        tasks,
        reports,
        leaves,
        announcements
    });

    db = data;
    serverSnapshot = clone(data);

    if (current) {
        const freshCurrent = db.users.find(u => u.id === current.id);
        if (freshCurrent) current = freshCurrent;
    }

    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch (_) {
        // LocalStorage is only a fallback cache now.
    }

    return data;
}

function userPayload(u) {
    return {
        name: String(u.name || "").trim(),
        email: String(u.email || "").trim().toLowerCase(),
        password: String(u.password || ""),
        role: u.role || "employee",
        title: u.title || u.designation || "",
        department: u.department || "",
        phone: String(u.phone || "").trim(),
        joiningDate: String(u.joiningDate || ""),
        active: u.active !== false,
        photo: u.photo || ""
    };
}

function projectPayload(p) {
    return {
        name: String(p.name || "").trim(),
        description: p.description || "",
        status: p.status || "Active",
        startDate: p.startDate || "",
        dueDate: p.dueDate || p.due || "",
        owner: p.owner || "",
        members: Array.isArray(p.members) ? p.members : []
    };
}

function taskPayload(t) {
    return {
        title: String(t.title || "").trim(),
        description: t.description || "",
        project: t.project || t.projectId || "",
        projectId: t.projectId || t.project || "",
        status: t.status || "To Do",
        priority: t.priority || "Medium",
        dueDate: t.dueDate || t.due || "",
        assignee: t.assignee || t.assigneeId || t.employeeId || "",
        assigneeId: t.assigneeId || t.assignee || t.employeeId || "",
        employeeId: t.employeeId || t.assignee || t.assigneeId || ""
    };
}

function reportPayload(r) {
    return {
        user: r.user || "",
        employeeName: r.employeeName || "",
        employeeEmail: r.employeeEmail || "",
        date: r.date || dateToday(),
        done: r.done || "",
        blockers: r.blockers || ""
    };
}

function leavePayload(l) {
    return {
        user: l.user || "",
        employeeName: l.employeeName || "",
        employeeEmail: l.employeeEmail || "",
        type: l.type || "",
        from: l.from || "",
        to: l.to || "",
        reason: l.reason || ""
    };
}

function announcementPayload(a) {
    return {
        title: a.title || "",
        message: a.message || a.body || ""
    };
}

function sameObject(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

async function migrateLocalDataToBackend(localData) {
    const idMap = new Map();
    idMap.set("owner", "owner");

    // Users first.
    for (const u of localData.users || []) {
        if (u.id === "owner" || u.role === "owner") continue;

        const created = await api("/api/employees", {
            method: "POST",
            body: JSON.stringify(userPayload(u))
        });

        idMap.set(u.id, created.id);

        if (u.documents) {
            try {
                localStorage.setItem(
                    `${KEY}_documents_${created.id}`,
                    JSON.stringify(u.documents)
                );
            } catch (_) {}
        }
    }

    // Projects second, because projects reference users.
    const projectIdMap = new Map();

    for (const p of localData.projects || []) {
        const payload = projectPayload({
            ...p,
            owner: idMap.get(p.owner) || "",
            members: (p.members || [])
                .map(x => idMap.get(x) || x)
                .filter(Boolean)
        });

        const created = await api("/api/projects", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        projectIdMap.set(p.id, created.id);

        if (p.status === "Completed") {
            const completed = await api(
                `/api/projects/${encodeURIComponent(created.id)}/complete?completed_by=${encodeURIComponent(idMap.get(p.completedBy) || "owner")}`,
                { method: "POST" }
            );

            // Preserve the historical snapshot names/photos from the local app.
            if (Array.isArray(p.memberSnapshots) && p.memberSnapshots.length) {
                // Backend creates snapshots from current members. The names/photos
                // therefore remain correct for migrated employees.
                void completed;
            }
        }
    }

    // Tasks third, because they reference projects/users.
    for (const t of localData.tasks || []) {
        await api("/api/tasks", {
            method: "POST",
            body: JSON.stringify(taskPayload({
                ...t,
                project: projectIdMap.get(t.project) || t.project || "",
                projectId: projectIdMap.get(t.projectId) || t.projectId || "",
                assignee: idMap.get(t.assignee) || t.assignee || "",
                assigneeId: idMap.get(t.assigneeId) || t.assigneeId || "",
                employeeId: idMap.get(t.employeeId) || t.employeeId || ""
            }))
        });
    }

    // Reports and leaves keep employee names even when an employee is removed later.
    for (const r of localData.reports || []) {
        await api("/api/reports", {
            method: "POST",
            body: JSON.stringify({
                ...reportPayload(r),
                user: idMap.get(r.user) || "",
                employeeName: r.employeeName || "",
                employeeEmail: r.employeeEmail || ""
            })
        });
    }

    for (const l of localData.leaves || []) {
        const created = await api("/api/leaves", {
            method: "POST",
            body: JSON.stringify({
                ...leavePayload(l),
                user: idMap.get(l.user) || "",
                employeeName: l.employeeName || "",
                employeeEmail: l.employeeEmail || ""
            })
        });

        if (l.status && l.status !== "Pending") {
            await api(`/api/leaves/${encodeURIComponent(created.id)}`, {
                method: "PUT",
                body: JSON.stringify({ status: l.status })
            });
        }
    }

    for (const a of localData.announcements || []) {
        await api(
            `/api/announcements?created_by=${encodeURIComponent(idMap.get(a.by) || "owner")}`,
            {
                method: "POST",
                body: JSON.stringify(announcementPayload(a))
            }
        );
    }

    // Keep browser-only employee documents attached to the new backend IDs
    // while the backend schema remains focused on employee profile fields.
    localData.users = (localData.users || []).map(u => ({
        ...u,
        id: idMap.get(u.id) || u.id
    }));

    try {
        localStorage.setItem(KEY, JSON.stringify(localData));
    } catch (_) {}
}

async function connectBackend() {
    try {
        const server = await fetchBackendData();
        const local = loadDB();

        const serverHasOnlyOwner =
            server.users.length <= 1 &&
            server.projects.length === 0 &&
            server.tasks.length === 0 &&
            server.reports.length === 0 &&
            server.leaves.length === 0 &&
            server.announcements.length === 0;

        const localHasData =
            local.users.some(u => u.role === "employee") ||
            local.projects.length ||
            local.tasks.length ||
            local.reports.length ||
            local.leaves.length ||
            local.announcements.length;

        if (serverHasOnlyOwner && localHasData) {
            toast("Migrating existing CTech data to SQLite...");

            await migrateLocalDataToBackend(local);
            await fetchBackendData();

            toast("Existing CTech data migrated to SQLite");
        }

        backendReady = true;
        return true;

    } catch (error) {
        backendReady = false;
        console.error("Backend connection error:", error);
        toast(error.message || "Could not connect to CTech backend");
        return false;
    }
}

async function syncDBToBackend() {
    if (!backendReady || !serverSnapshot || backendSyncBusy) {
        return;
    }

    backendSyncBusy = true;

    try {
        const before = serverSnapshot;
        const after = clone(db);

        // ---------------- USERS ----------------
        const beforeUsers = new Map(before.users.map(x => [x.id, x]));
        const afterUsers = new Map(after.users.map(x => [x.id, x]));

        for (const [uid] of beforeUsers) {
            if (uid !== "owner" && !afterUsers.has(uid)) {
                await api(`/api/employees/${encodeURIComponent(uid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [uid, u] of afterUsers) {
            if (uid === "owner") {
                if (!beforeUsers.has(uid) || !sameObject(userPayload(u), userPayload(beforeUsers.get(uid)))) {
                    await api(`/api/employees/${encodeURIComponent(uid)}`, {
                        method: "PUT",
                        body: JSON.stringify(userPayload(u))
                    });
                }
                continue;
            }

            if (!beforeUsers.has(uid)) {
                const created = await api("/api/employees", {
                    method: "POST",
                    body: JSON.stringify(userPayload(u))
                });
                if (created?.id && created.id !== uid) {
                    // IDs are normally preserved by the frontend after first migration.
                    // If a new backend ID is returned, keep the returned user in the next refresh.
                }
            } else if (!sameObject(userPayload(u), userPayload(beforeUsers.get(uid)))) {
                await api(`/api/employees/${encodeURIComponent(uid)}`, {
                    method: "PUT",
                    body: JSON.stringify(userPayload(u))
                });
            }
        }

        // ---------------- PROJECTS ----------------
        const beforeProjects = new Map(before.projects.map(x => [x.id, x]));
        const afterProjects = new Map(after.projects.map(x => [x.id, x]));

        for (const [pid] of beforeProjects) {
            if (!afterProjects.has(pid)) {
                await api(`/api/projects/${encodeURIComponent(pid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [pid, p] of afterProjects) {
            if (!beforeProjects.has(pid)) {
                await api("/api/projects", {
                    method: "POST",
                    body: JSON.stringify(projectPayload(p))
                });
            } else if (!sameObject(projectPayload(p), projectPayload(beforeProjects.get(pid)))) {
                await api(`/api/projects/${encodeURIComponent(pid)}`, {
                    method: "PUT",
                    body: JSON.stringify(projectPayload(p))
                });
            }
        }

        // ---------------- TASKS ----------------
        const beforeTasks = new Map(before.tasks.map(x => [x.id, x]));
        const afterTasks = new Map(after.tasks.map(x => [x.id, x]));

        for (const [tid] of beforeTasks) {
            if (!afterTasks.has(tid)) {
                await api(`/api/tasks/${encodeURIComponent(tid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [tid, t] of afterTasks) {
            if (!beforeTasks.has(tid)) {
                await api("/api/tasks", {
                    method: "POST",
                    body: JSON.stringify(taskPayload(t))
                });
            } else if (!sameObject(taskPayload(t), taskPayload(beforeTasks.get(tid)))) {
                await api(`/api/tasks/${encodeURIComponent(tid)}`, {
                    method: "PUT",
                    body: JSON.stringify(taskPayload(t))
                });
            }
        }

        // ---------------- REPORTS ----------------
        const beforeReports = new Map(before.reports.map(x => [x.id, x]));
        const afterReports = new Map(after.reports.map(x => [x.id, x]));

        for (const [rid] of beforeReports) {
            if (!afterReports.has(rid)) {
                await api(`/api/reports/${encodeURIComponent(rid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [rid, r] of afterReports) {
            if (!beforeReports.has(rid)) {
                await api("/api/reports", {
                    method: "POST",
                    body: JSON.stringify(reportPayload(r))
                });
            } else if (!sameObject(reportPayload(r), reportPayload(beforeReports.get(rid)))) {
                await api(`/api/reports/${encodeURIComponent(rid)}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        date: r.date || "",
                        done: r.done || "",
                        blockers: r.blockers || ""
                    })
                });
            }
        }

        // ---------------- LEAVES ----------------
        const beforeLeaves = new Map(before.leaves.map(x => [x.id, x]));
        const afterLeaves = new Map(after.leaves.map(x => [x.id, x]));

        for (const [lid] of beforeLeaves) {
            if (!afterLeaves.has(lid)) {
                await api(`/api/leaves/${encodeURIComponent(lid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [lid, l] of afterLeaves) {
            if (!beforeLeaves.has(lid)) {
                const created = await api("/api/leaves", {
                    method: "POST",
                    body: JSON.stringify(leavePayload(l))
                });
                if (l.status && l.status !== "Pending") {
                    await api(`/api/leaves/${encodeURIComponent(created.id)}`, {
                        method: "PUT",
                        body: JSON.stringify({ status: l.status })
                    });
                }
            } else if (!sameObject(leavePayload(l), leavePayload(beforeLeaves.get(lid))) || l.status !== beforeLeaves.get(lid).status) {
                await api(`/api/leaves/${encodeURIComponent(lid)}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        type: l.type || "",
                        from: l.from || "",
                        to: l.to || "",
                        reason: l.reason || "",
                        status: l.status || "Pending"
                    })
                });
            }
        }

        // ---------------- ANNOUNCEMENTS ----------------
        const beforeAnnouncements = new Map(before.announcements.map(x => [x.id, x]));
        const afterAnnouncements = new Map(after.announcements.map(x => [x.id, x]));

        for (const [aid] of beforeAnnouncements) {
            if (!afterAnnouncements.has(aid)) {
                await api(`/api/announcements/${encodeURIComponent(aid)}`, {
                    method: "DELETE"
                });
            }
        }

        for (const [aid, a] of afterAnnouncements) {
            if (!beforeAnnouncements.has(aid)) {
                await api(
                    `/api/announcements?created_by=${encodeURIComponent(a.by || current?.id || "owner")}`,
                    {
                        method: "POST",
                        body: JSON.stringify(announcementPayload(a))
                    }
                );
            } else if (!sameObject(announcementPayload(a), announcementPayload(beforeAnnouncements.get(aid)))) {
                await api(`/api/announcements/${encodeURIComponent(aid)}`, {
                    method: "PUT",
                    body: JSON.stringify(announcementPayload(a))
                });
            }
        }

        await fetchBackendData();

    } catch (error) {
        console.error("Backend sync error:", error);
        toast(error.message || "Could not save changes to SQLite");
    } finally {
        backendSyncBusy = false;
    }
}

function queueBackendSync() {
    if (!backendReady) return;

    backendSyncPromise = backendSyncPromise
        .catch(() => {})
        .then(async () => {
            if (backendSyncBusy) {
                backendSyncQueued = true;
                return;
            }

            await syncDBToBackend();

            if (backendSyncQueued) {
                backendSyncQueued = false;
                await syncDBToBackend();
            }
        });
}

const seed = {
    users: [{
        id: "owner",
        name: "Owner",
        email: "owner@worknest.demo",
        password: "owner123",
        role: "owner",
        title: "Administrator",
        department: "Management",
        active: true,
        photo: ""
    }],

    projects: [],

    tasks: [],

    reports: [],

    leaves: [],

    announcements: []
};

let db = loadDB();
let current = null;
let page = "dashboard";

// ================= DATABASE =================

function loadDB() {
    try {
        const saved = localStorage.getItem(KEY);
        if (!saved) return structuredClone(seed);

        const data = JSON.parse(saved);
        if (!data || typeof data !== "object") return structuredClone(seed);

        for (const key of ["users", "projects", "tasks", "reports", "leaves", "announcements"]) {
            if (!Array.isArray(data[key])) data[key] = [];
        }

        data.users = data.users.map(u => ({
            ...u,
            active: u.active !== false && u.active !== "false",
            photo: u.photo || "",
            documents: u.documents || {}
        }));

        data.projects = data.projects.map(p => ({
            ...p,
            members: Array.isArray(p.members) ? p.members : [],
            completedAt: p.completedAt || "",
            completedBy: p.completedBy || "",
            completedByName: p.completedByName || "",
            memberSnapshots: Array.isArray(p.memberSnapshots) ? p.memberSnapshots : [],
            due: p.due || p.dueDate || "",
            dueDate: p.dueDate || p.due || ""
        }));

        data.tasks = data.tasks.map(t => ({
            ...t,
            project: t.project || t.projectId || "",
            projectId: t.projectId || t.project || "",
            assignee: t.assignee || t.assigneeId || t.employeeId || "",
            assigneeId: t.assigneeId || t.assignee || t.employeeId || "",
            employeeId: t.employeeId || t.assignee || t.assigneeId || "",
            due: t.due || t.dueDate || "",
            dueDate: t.dueDate || t.due || ""
        }));

        data.announcements = data.announcements.map(a => ({
            ...a,
            body: a.body || a.message || "",
            message: a.message || a.body || ""
        }));

        if (!data.users.some(u => u.role === "owner")) {
            data.users.unshift(structuredClone(seed.users[0]));
        }

        return data;
    } catch (error) {
        console.error("Database loading error:", error);
        return structuredClone(seed);
    }
}

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
        queueBackendSync();
        return true;
    } catch (error) {
        console.error("Local cache saving error:", error);
        toast("Could not save local cache.");
        return false;
    }
}

function esc(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

function toast(message) {
    const t = $("#toast");
    if (!t) {
        console.log(message);
        return;
    }

    t.textContent = message;
    t.classList.add("show");

    clearTimeout(window.tt);

    window.tt = setTimeout(() => {
        t.classList.remove("show");
    }, 2600);
}

function id() {
    return Math.random().toString(36).slice(2, 10);
}

function dateToday() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function fmt(d) {
    return d
        ? new Date(d + "T12:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        })
        : "—";
}

function initials(name = "") {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map(x => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

// ================= PROFILE PHOTO =================

function avatarMarkup(user, cls = "avatar") {
    const name = esc(user?.name || "");
    const photo = user?.photo || "";
    const uid = esc(user?.id || "");

    return `
        <div
            class="${cls}"
            onclick="openPhotoViewer('${uid}')"
            style="cursor:pointer;overflow:hidden;"
            title="View profile photo"
        >
            ${
                photo
                    ? `<img
                        src="${photo}"
                        alt="${name}"
                        style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
                    >`
                    : `<span>${esc(initials(user?.name || ""))}</span>`
            }
        </div>
    `;
}

function openPhotoViewer(uid) {
    const user = db.users.find(u => u.id === uid) || current;

    if (!user || !user.photo) {
        return toast("No profile photo available");
    }

    $("#photoViewer")?.remove();

    document.body.insertAdjacentHTML("beforeend", `
        <div class="photo-viewer" id="photoViewer"
             onclick="this.remove()">
            <button
                class="photo-viewer-close"
                type="button"
                onclick="event.stopPropagation();this.parentElement.remove()"
            >×</button>

            <div class="photo-viewer-card"
                 onclick="event.stopPropagation()">
                <img src="${user.photo}" alt="${esc(user.name)} profile photo">
                <b>${esc(user.name)}</b>
            </div>
        </div>
    `);
}

function photoToDataURL(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.size) {
            resolve("");
            return;
        }

        if (!file.type.startsWith("image/")) {
            reject(new Error("Please choose an image file"));
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => reject(new Error("Could not read the image"));

        reader.onload = () => {
            const img = new Image();

            img.onerror = () => reject(new Error("Invalid image file"));

            img.onload = () => {
                const max = 320;
                const scale = Math.min(
                    1,
                    max / Math.max(img.width, img.height)
                );

                const canvas = document.createElement("canvas");

                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));

                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    reject(new Error("Could not process the image"));
                    return;
                }

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                resolve(canvas.toDataURL("image/jpeg", 0.78));
            };

            img.src = reader.result;
        };

        reader.readAsDataURL(file);
    });
}

// ================= COMMON HELPERS =================

function statusBadge(s) {
    const c =
        s === "Completed" || s === "Approved" ? "green" :
        s === "In Progress" || s === "Pending" ? "orange" :
        s === "Overdue" || s === "Rejected" ? "red" : "blue";

    return `<span class="badge ${c}">${esc(s || "To Do")}</span>`;
}

function userBy(uid) {
    return db.users.find(u => u.id === uid) || { name: "Unassigned" };
}

function projectBy(pid) {
    return db.projects.find(p => p.id === pid) || { name: "No project" };
}

function myTasks() {
    return db.tasks.filter(t =>
        current?.role === "owner" || t.assignee === current?.id
    );
}

// ================= LOGIN =================

function loginView() {
    $("#app").innerHTML = `
        <div class="login-wrap">
            <form class="login-card" id="loginForm">
                <div class="brand">
    <img
        src="./asset/company-logo.png"
        alt="Company Logo"
        class="company-logo"
    >

    <span class="company-name login-company-name">
        <span class="company-c">C</span><span class="company-tech">Tech</span>
    </span>
</div>

                <h1>Welcome back</h1>
                <p class="muted">Sign in to manage your work and team.</p>

                <div class="field">
                    <label>Email address</label>
                    <input id="email" type="email" required
                           placeholder="you@company.com"
                           autocomplete="username">
                </div>

                <div class="field">
                    <label>Password</label>
                    <input id="password" type="password" required
                           placeholder="Enter password"
                           autocomplete="current-password">
                </div>

                <button class="btn full" type="submit">Sign in →</button>

                
            </form>
        </div>
    `;

    $("#loginForm").onsubmit = async e => {
        e.preventDefault();

        const email = $("#email").value.trim().toLowerCase();
        const password = $("#password").value;

        try {
            const result = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            if (!result?.ok || !result?.user) {
                return toast("Invalid email, password, or inactive account");
            }

            current = result.user;

            // Load SQLite as the real application data source.
            await connectBackend();

            current = db.users.find(u => u.id === result.user.id) || result.user;
            page = "dashboard";
            render();

            toast("Login successful");

        } catch (error) {
            console.error("Login error:", error);
            toast(error.message || "Could not connect to CTech backend");
        }
    };
}

// ================= MAIN RENDER =================

function nav(p, i, t) {
    return `
        <button class="nav-btn ${page === p ? "active" : ""}" data-page="${p}">
            <span class="ico">${i}</span>${t}
        </button>
    `;
}

function pageTitle() {
    return ({
        dashboard: "Dashboard",
        employees: "Employee Management",
        projects: "Project Management",
        completedprojects: "Completed Projects",
        myprojects: "My Projects",
        tasks: "Task Management",
        mytasks: "My Tasks",
        reports: "Daily Work Reports",
        leaves: "Leave Management",
        announcements: "Announcements"
    })[page] || "Dashboard";
}

function head(title, subtitle = "", action = "") {
    return `
        <div class="page-head">
            <div>
                <h1>${esc(title)}</h1>
                ${
                    subtitle
                        ? `<p class="muted">${esc(subtitle)}</p>`
                        : ""
                }
            </div>

            ${
                action
                    ? `<div class="page-actions">${action}</div>`
                    : ""
            }
        </div>
    `;
}

function stat(label, value, note = "", icon = "") {
    return `
        <div class="stat-card">
            <div class="stat-icon">${icon}</div>
            <div class="stat-info">
                <div class="stat-label">${esc(label)}</div>
                <div class="stat-value">${esc(String(value))}</div>
                ${
                    note
                        ? `<div class="stat-note">${esc(note)}</div>`
                        : ""
                }
            </div>
        </div>
    `;
}




function render() {
    if (!current) {
        loginView();
        return;
    }

    const owner = current.role === "owner";

    const firstName = String(current.name || "")
        .trim()
        .split(/\s+/)[0];

    $("#app").innerHTML = `
        <div class="layout">

            <aside class="sidebar" id="sidebar">

                <div class="brand">
                    <img
                        src="./asset/company-logo.png"
                        alt="Company Logo"
                        class="company-logo"
                    >

                    <span class="company-name">
                        <span class="company-c">C</span><span class="company-tech">Tech</span>
                    </span>
                </div>

                <div class="nav-label">WORKSPACE</div>

                ${nav("dashboard", "▦", "Dashboard")}

                ${owner ? nav("employees", "♙", "Employees") : ""}

                ${
                    owner
                        ? nav("projects", "▤", "Projects")
                        : nav("myprojects", "▤", "My Projects")
                }

                ${owner ? nav("completedprojects", "✓", "Completed Projects") : ""}

                ${
                    owner
                        ? nav("tasks", "✓", "All Tasks")
                        : nav("mytasks", "✓", "My Tasks")
                }

                ${nav("reports", "▥", "Daily Reports")}

                ${nav("leaves", "▣", "Leave Management")}

                ${owner ? nav("announcements", "◉", "Announcements") : ""}

                <div class="side-bottom">
                    Signed in as<br>
                    <b>${esc(current.name)}</b><br>
                    <span>
                        ${owner ? "Owner / Admin" : "Employee"}
                    </span>
                </div>

            </aside>


            <main class="main">

                <header class="topbar">

                    <div style="display:flex;align-items:center;gap:12px;">

                        <button
                            class="btn ghost mobile-menu"
                            type="button"
                            onclick="$('#sidebar').classList.toggle('open')"
                        >
                            ☰
                        </button>

                        <h2 class="topbar-title">${pageTitle()}</h2>

                    </div>


                    <div
                        style="
                            display:flex;
                            align-items:center;
                            justify-content:flex-end;
                            gap:12px;
                            min-width:0;
                        "
                    >

                        <span
                            style="
                                display:inline-block;
                                font-size:14px;
                                font-weight:600;
                                color:var(--text);
                                white-space:nowrap;
                            "
                        >
                            Hi, ${esc(firstName)} 👋
                        </span>

                        ${avatarMarkup(current, "mini-avatar")}

                        <button
                            class="btn ghost small"
                            type="button"
                            onclick="openMyProfile()"
                        >
                            My Profile
                        </button>

                    </div>

                </header>


                <section
                    class="content"
                    id="content"
                ></section>

            </main>

        </div>
    `;


    $$(".nav-btn").forEach(btn => {

        btn.onclick = () => {

            page = btn.dataset.page;

            render();

        };

    });


    renderPage();
}
// ================= PAGE ROUTER =================

function renderPage() {

    const content = document.getElementById("content");

    if (!content) {
        console.error("WorkNest: #content element not found.");
        return;
    }

    try {

        switch (page) {

            case "dashboard":
                content.innerHTML = dashboard();
                break;

            case "employees":
                content.innerHTML = employeesPage();
                break;

            case "projects":
    content.innerHTML = projectsPage(false);
    break;

case "completedprojects":
    content.innerHTML = completedProjectsPage();
    break;

case "myprojects":
    content.innerHTML = projectsPage(true);
    break;

            case "tasks":
                content.innerHTML = tasksPage(false);
                break;

            case "mytasks":
                content.innerHTML = tasksPage(true);
                break;

            case "reports":
                content.innerHTML = reportsPage();
                break;

            case "leaves":
                content.innerHTML = leavesPage();
                break;

            case "announcements":
                content.innerHTML = announcementsPage();
                break;

            default:
                content.innerHTML = dashboard();
        }

        bindPage();

    } catch (error) {

        console.error(
            "WorkNest page rendering error:",
            error
        );

        content.innerHTML = `
            <div class="panel">
                <div class="empty">

                    <h3>Something went wrong</h3>

                    <p>
                        The page could not be loaded.
                    </p>

                    <p class="muted">
                        Open browser Console with F12
                        to see the JavaScript error.
                    </p>

                </div>
            </div>
        `;
    }
}

// ================= DASHBOARD =================

function dashboard() {
    const owner = current.role === "owner";
    const ts = myTasks();
    const done = ts.filter(t => t.status === "Completed").length;
    const pending = ts.filter(t => t.status !== "Completed").length;

    const projs = owner
    ? db.projects.filter(p => p.status !== "Completed")
    : db.projects.filter(
        p =>
            (p.members || []).includes(current.id) &&
            p.status !== "Completed"
    );

    const overdue = ts.filter(t =>
        t.status !== "Completed" && t.due && t.due < dateToday()
    ).length;

    return `
        ${head(
            `Good ${
                new Date().getHours() < 12
                    ? "morning"
                    : new Date().getHours() < 17
                        ? "afternoon"
                        : "evening"
            }, ${esc(current.name.trim().split(/\s+/)[0].charAt(0).toUpperCase() + current.name.trim().split(/\s+/)[0].slice(1).toLowerCase())} 👋`,
            "Here’s what’s happening with your work today.",
            owner ? `<button class="btn" onclick="openTask()">＋ Assign task</button>` : ""
        )}

        <div class="stats">
            ${stat(
                owner ? "Total Employees" : "My Projects",
                owner
                    ? db.users.filter(u => u.role === "employee" && u.active !== false).length
                    : projs.length,
                owner ? "Active team members" : "Projects assigned to you",
                "♙"
            )}
            ${stat("Active Projects", projs.filter(p => p.status === "Active").length, "Currently in progress", "▤")}
            ${stat("Completed Tasks", done, `${ts.length ? Math.round(done / ts.length * 100) : 0}% of your tasks`, "✓")}
            ${stat("Pending Tasks", pending, `${overdue} overdue`, "◷")}
        </div>

        <div class="grid2">
            <div class="panel">
                <div class="panel-head">
                    <h3>${owner ? "Recent tasks" : "My tasks"}</h3>
                    <button class="btn ghost small" onclick="go('${owner ? "tasks" : "mytasks"}')">View all</button>
                </div>
                ${taskList(
                    ts.slice()
                        .sort((a, b) => (a.due || "").localeCompare(b.due || ""))
                        .slice(0, 5),
                    !owner
                )}
            </div>

            <div class="panel">

    <div class="panel-head">

        <h3>Project progress</h3>

        <div style="display:flex;gap:8px;">

            <button
                class="btn ghost small"
                onclick="go('${owner ? "projects" : "myprojects"}')"
            >
                View all
            </button>

            ${
                owner
                    ? `
                        <button
                            class="btn ghost small"
                            onclick="go('completedprojects')"
                        >
                            Completed
                        </button>
                    `
                    : ""
            }

        </div>

    </div>

                ${
                    projs.length
                        ? projs.slice(0, 6).map(p => {
                            const all = db.tasks.filter(t => t.project === p.id);
                            const d = all.filter(t => t.status === "Completed").length;
                            const pc = all.length ? Math.round(d / all.length * 100) : 0;

                            return `
                                <div style="margin-bottom:20px">
                                    <div style="display:flex;justify-content:space-between;margin-bottom:9px;font-size:12px">
                                        <b>${esc(p.name)}</b>
                                        <span class="muted">${pc}%</span>
                                    </div>
                                    <div class="progress"><span style="width:${pc}%"></span></div>
                                    <div class="muted" style="font-size:11px;margin-top:7px">
                                        ${all.length} tasks · ${d} completed
                                    </div>
                                </div>
                            `;
                        }).join("")
                        : `<div class="empty"><b>No projects yet</b>Create a project to start tracking work.</div>`
                }
            </div>
        </div>

        ${
            owner
                ? `
                    <div class="panel">
                        <div class="panel-head">
                            <h3>Team snapshot</h3>
                            <button class="btn ghost small" onclick="go('employees')">Manage team</button>
                        </div>
                        ${employeeTable(db.users.filter(u => u.role === "employee").slice(0, 5))}
                    </div>
                `
                : `
                    <div class="panel">
                        <div class="panel-head"><h3>Latest announcements</h3></div>
                        ${announcementList(db.announcements.slice().reverse().slice(0, 3))}
                    </div>
                `
        }
    `;
}

// ================= EMPLOYEES =================
function employeeTable(users) {

    if (!users.length) {
        return `
            <div class="empty">
                <b>No employees yet</b>
                Add your first employee to get started.
            </div>
        `;
    }

    return `
        <div class="table-wrap">

            <table>

                <thead>
                    <tr>
                        <th>EMPLOYEE</th>
                        <th>DEPARTMENT</th>
                        <th>OPEN TASKS</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                    </tr>
                </thead>

                <tbody>

                    ${users.map(u => {

                        const isActive = u.active !== false;

                        return `
                            <tr>

                                <td>
                                    <div class="person">

                                        ${avatarMarkup(
                                            u,
                                            "mini-avatar"
                                        )}

                                        <div>
                                            <b>${esc(u.name)}</b>

                                            <div class="muted">
                                                ${esc(u.email)}
                                            </div>
                                        </div>

                                    </div>
                                </td>

                                <td>
                                    ${esc(
                                        u.department || "—"
                                    )}
                                </td>

                                <td>
                                    ${
                                        db.tasks.filter(
                                            t =>
                                                t.assignee === u.id &&
                                                t.status !== "Completed"
                                        ).length
                                    }
                                </td>

                                <td>
                                    ${statusBadge(
                                        isActive
                                            ? "Active"
                                            : "Inactive"
                                    )}
                                </td>

                                <td>

                                    <div
                                        style="
                                            display:flex;
                                            gap:6px;
                                            flex-wrap:wrap;
                                        "
                                    >

                                        <!-- VIEW -->
                                        <button
                                            class="btn small"
                                            type="button"
                                            onclick="viewEmployee('${u.id}')"
                                        >
                                            View
                                        </button>

                                        <!-- EDIT -->
                                        <button
                                            class="btn ghost small"
                                            type="button"
                                            onclick="openEmployee('${u.id}')"
                                        >
                                            Edit
                                        </button>

                                        <!-- DELETE -->
                                        <button
                                            class="btn danger small"
                                            type="button"
                                            onclick="deleteEmployee('${u.id}')"
                                        >
                                            Delete
                                        </button>

                                    </div>

                                </td>

                            </tr>
                        `;

                    }).join("")}

                </tbody>

            </table>

        </div>
    `;
}

// ================= EMPLOYEE EMAIL GENERATOR =================

function generateEmployeeEmail(name, currentUid = "") {
    const cleanName = String(name || "")
        .trim()
        .replace(/\s+/g, ".")
        .replace(/[^a-zA-Z.]/g, "")
        .replace(/^\.+|\.+$/g, "");

    if (!cleanName) {
        return "";
    }

    const baseEmail = `${cleanName}@ctech.in`;

    // Check normal email first
    const baseExists = db.users.some(u =>
        u.id !== currentUid &&
        String(u.email || "").trim().toLowerCase() === baseEmail.toLowerCase()
    );

    if (!baseExists) {
        return baseEmail;
    }

    // Duplicate:
    // Arun.Kumar2@ctech.in
    // Arun.Kumar3@ctech.in
    // Arun.Kumar4@ctech.in
    let number = 2;

    while (true) {
        const email = `${cleanName}${number}@ctech.in`;

        const exists = db.users.some(u =>
            u.id !== currentUid &&
            String(u.email || "").trim().toLowerCase() === email.toLowerCase()
        );

        if (!exists) {
            return email;
        }

        number++;
    }
}



function openEmployee(uid) {

    const u = db.users.find(
        x => x.id === uid
    ) || {};

    const initialEmail = uid
        ? String(u.email || "").trim()
        : "";

    const documents = u.documents || {};

    modal(

        uid
            ? "Edit Employee"
            : "Create Employee",

        `

        <h3 style="margin:0 0 15px;">
            Employee Details
        </h3>

        <div class="form-grid">

            <!-- PROFILE PHOTO -->

            <div class="wide profile-photo-field">

                ${avatarMarkup(
                    u,
                    "profile-preview"
                )}

                <div class="field">

                    <label>
                        Profile Photo
                    </label>

                    <input
                        name="photo"
                        type="file"
                        accept="image/*"
                    >

                    <small class="muted">
                        Optional employee photo.
                    </small>

                    ${
                        u.photo
                            ? `
                                <button
                                    type="button"
                                    class="btn ghost small"
                                    onclick="
                                        removeEmployeePhoto('${u.id}')
                                    "
                                >
                                    Remove photo
                                </button>
                            `
                            : ""
                    }

                </div>

            </div>


            <!-- NAME -->

            ${field(
                "Name",
                "name",
                "text",
                u.name || ""
            )}


            <!-- EMAIL -->

            <div class="field">

                <label>
                    Email
                </label>

                <input
                    id="employeeEmail"
                    name="email"
                    type="email"
                    value="${esc(initialEmail)}"
                    readonly
                    required
                    style="
                        background:var(--surface-2);
                        cursor:not-allowed;
                    "
                >

                <small class="muted">
                    Email is automatically generated
                    from employee name.
                </small>

            </div>


            <!-- PHONE -->

            ${field(
                "Phone",
                "phone",
                "tel",
                u.phone || ""
            )}


            <!-- DESIGNATION -->

            ${field(
                "Designation",
                "designation",
                "text",
                u.designation || u.title || ""
            )}


            <!-- DEPARTMENT -->

            ${field(
                "Department",
                "department",
                "text",
                u.department || ""
            )}


            <!-- JOINING DATE -->

            ${field(
                "Joining Date",
                "joiningDate",
                "date",
                u.joiningDate || ""
            )}


            <!-- PASSWORD -->

            ${field(
                "Password",
                "password",
                "password",
                "",
                !uid
            )}


            <!-- STATUS -->

            ${field(
                "Account Status",
                "active",
                "text",
                u.active === false
                    ? "false"
                    : "true",
                true,
                [
                    {
                        value: "true",
                        label: "Active"
                    },
                    {
                        value: "false",
                        label: "Inactive"
                    }
                ]
            )}

        </div>


        <!-- ================= DOCUMENTS ================= -->

        <h3 style="
            margin:28px 0 15px;
        ">
            Documents
        </h3>


        <div class="form-grid">


            <!-- RESUME -->

            <div class="field">

                <label>
                    Resume
                </label>

                <input
                    name="resume"
                    type="file"
                  
                >

                ${
                    documents.resume
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.resume.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>


            <!-- AADHAAR / ID -->

            <div class="field">

                <label>
                    Aadhaar / ID proof
                </label>

                <input
                    name="aadhaar"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                >

                ${
                    documents.aadhaar
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.aadhaar.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>


            <!-- PAN -->

            <div class="field">

                <label>
                    PAN
                </label>

                <input
                    name="pan"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                >

                ${
                    documents.pan
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.pan.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>


            <!-- DEGREE -->

            <div class="field">

                <label>
                    Degree Certificate
                </label>

                <input
                    name="degree"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                >

                ${
                    documents.degree
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.degree.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>


            <!-- MARK SHEETS -->

            <div class="field">

                <label>
                    Mark Sheets
                </label>

                <input
                    name="marksheets"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                >

                ${
                    documents.marksheets
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.marksheets.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>


            <!-- TECHNICAL CERTIFICATES -->

            <div class="field">

                <label>
                    Technical Certificates
                </label>

                <input
                    name="technical"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                >

                ${
                    documents.technical
                        ? `
                            <small class="muted">
                                Existing:
                                ${esc(
                                    documents.technical.name
                                )}
                            </small>
                        `
                        : ""
                }

            </div>

        </div>


        ${
            uid
                ? `
                    <p class="muted">
                        Leave password blank to keep
                        the current password.
                    </p>
                `
                : `
                    <p class="muted">
                        Enter password manually.
                        Employee email is generated automatically.
                    </p>
                `
        }

        `,

        "Save Employee",

        async f => {

            const name = String(
                f.get("name") || ""
            ).trim();

            const password = String(
                f.get("password") || ""
            );

            if (!name) {
                return toast(
                    "Employee name is required"
                );
            }


            // =========================
            // AUTO EMAIL
            // =========================

            const email =
                generateEmployeeEmail(
                    name,
                    uid || ""
                );

            if (!email) {
                return toast(
                    "Could not generate employee email"
                );
            }


            // =========================
            // PASSWORD
            // =========================

            if (!uid && !password) {
                return toast(
                    "Password is required"
                );
            }


            // =========================
            // PHOTO
            // =========================

            let photo = u.photo || "";

            try {

                const photoFile =
                    f.get("photo");

                if (
                    photoFile &&
                    photoFile.size
                ) {
                    photo =
                        await photoToDataURL(
                            photoFile
                        );
                }

            } catch (error) {

                return toast(
                    error.message ||
                    "Could not load photo"
                );

            }


            // =========================
            // DOCUMENTS
            // =========================

            const newDocuments = {
                ...documents
            };


            const documentFields = [
                "resume",
                "aadhaar",
                "pan",
                "degree",
                "marksheets",
                "technical"
            ];


            try {

                for (
                    const key of documentFields
                ) {

                    const file =
                        f.get(key);

                    if (
                        file &&
                        file.size
                    ) {

                        newDocuments[key] =
                            await fileToDataURL(
                                file
                            );

                    }

                }

            } catch (error) {

                return toast(
                    error.message ||
                    "Could not upload document"
                );

            }


            // =========================
            // EMPLOYEE DATA
            // =========================

      // =========================
// EMPLOYEE DATA
// =========================

const designation =
    String(
        f.get("designation") || ""
    ).trim();

const data = {

    id:
        uid ||
        id(),

    name,

    email,

    password:
        password ||
        u.password ||
        "",

    phone:
        String(
            f.get("phone") || ""
        ).trim(),

    designation,

    title: designation,

    department:
        String(
            f.get("department") ||
            ""
        ).trim(),

    joiningDate:
        String(
            f.get("joiningDate") ||
            ""
        ),

    role: "employee",

    active:
        f.get("active") === "true",

    photo,

    documents:
        newDocuments
};


// =========================
// SAVE EMPLOYEE TO FASTAPI
// =========================

try {
    const payload = userPayload(data);
    let savedUser;

    if (uid) {
        savedUser = await api(`/api/employees/${encodeURIComponent(uid)}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    } else {
        savedUser = await api("/api/employees", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    const localUser = {
        ...savedUser,
        documents: newDocuments
    };

    if (uid) {
        const index = db.users.findIndex(x => x.id === uid);
        if (index >= 0) db.users[index] = localUser;
    } else {
        db.users.push(localUser);
    }

    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch (_) {}

    await fetchBackendData();
    closeModal();
    renderPage();
    toast(`Employee saved — Login: ${savedUser.email}`);

} catch (error) {
    console.error("Employee API save error:", error);
    toast(error.message || "Could not save employee");
    return;
}
        }
    );


    // =========================
    // AUTO EMAIL PREVIEW
    // =========================

    const nameInput =
        document.querySelector(
            '#modalForm input[name="name"]'
        );

    const emailInput =
        document.querySelector(
            '#modalForm input[name="email"]'
        );


    if (
        nameInput &&
        emailInput
    ) {

        const updateEmail = () => {

            const name =
                nameInput.value.trim();


            if (!name) {

                emailInput.value = "";

                return;
            }


            // Existing employee,
            // name unchanged
            if (
                uid &&
                name.toLowerCase() ===
                String(
                    u.name || ""
                )
                .trim()
                .toLowerCase()
            ) {

                emailInput.value =
                    u.email || "";

                return;
            }


            emailInput.value =
                generateEmployeeEmail(
                    name,
                    uid || ""
                );
        };


        nameInput.addEventListener(
            "input",
            updateEmail
        );


        if (!uid) {
            updateEmail();
        }

    }

} 


function fileToDataURL(file) {

    return new Promise(
        (resolve, reject) => {

            if (
                !file ||
                !file.size
            ) {
                resolve(null);
                return;
            }


            // LocalStorage size protection
            if (
                file.size >
                5 * 1024 * 1024
            ) {

                reject(
                    new Error(
                        "Document must be smaller than 5 MB"
                    )
                );

                return;
            }


            const reader =
                new FileReader();


            reader.onerror = () => {

                reject(
                    new Error(
                        "Could not read document"
                    )
                );

            };


            reader.onload = () => {

                resolve({

                    name: file.name,

                    type:
                        file.type ||
                        "application/octet-stream",

                    size:
                        file.size,

                    data:
                        reader.result

                });

            };


            reader.readAsDataURL(file);

        }
    );
}





// ================= PROJECTS =================

function projectsPage(mine) {
    const ps = mine
        ? db.projects.filter(
            p =>
                (p.members || []).includes(current.id) &&
                p.status !== "Completed"
        )
        : db.projects.filter(
            p => p.status !== "Completed"
        );

    return `
    ${head(
        mine ? "My Projects" : "Project Management",
        mine
            ? "Projects assigned to you."
            : "Create projects and organize team work.",
        mine
            ? ""
            : `<button
                    class="btn"
                    type="button"
                    onclick="openProject()"
               >
                    ＋ New project
               </button>`
    )}

        <div class="stats">
            ${stat("Total Projects", ps.length, "Visible projects", "▤")}
            ${stat("Active", ps.filter(p => p.status === "Active").length, "In progress", "◷")}
            ${stat(
    "Completed",
    db.projects.filter(p => p.status === "Completed").length,
    "Finished projects",
    "✓"
)}
            ${stat("Tasks", db.tasks.filter(t => ps.some(p => p.id === t.project)).length, "Across these projects", "☷")}
        </div>

        <div class="grid2">
            ${
                ps.map(p => {
                    const ts = db.tasks.filter(t => t.project === p.id);
                    const d = ts.filter(t => t.status === "Completed").length;
                    const pc = ts.length ? Math.round(d / ts.length * 100) : 0;

                    return `
                        <div class="panel">
                            <div class="panel-head">
                                <h3>${esc(p.name)}</h3>
                                ${statusBadge(p.status)}
                            </div>

                            <p class="muted">${esc(p.description || "No description provided.")}</p>

                            <div class="muted" style="font-size:12px;margin:15px 0">
                                Owner: ${esc(userBy(p.owner).name)} · Due ${fmt(p.due)}
                            </div>

                            <div class="progress"><span style="width:${pc}%"></span></div>

                            <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:8px;color:var(--muted)">
                                <span>${d}/${ts.length} tasks complete</span>
                                <b>${pc}%</b>
                            </div>

                            <div class="task-meta" style="margin-top:14px">
                                ${(p.members || []).map(x =>
                                    `<span class="badge">${esc(userBy(x).name)}</span>`
                                ).join("")}
                            </div>

                            ${
                                !mine
                                    ? `
                                        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:15px">
                                            <button class="btn ghost small" onclick="openProject('${p.id}')">Edit</button>
                                            <button class="btn secondary small" onclick="openTask('${p.id}')">＋ Task</button>
                                        </div>
                                    `
                                    : ""
                            }
                        </div>
                    `;
                }).join("")
                || `
                    <div class="panel empty">
                        <b>No projects found</b>
                        ${mine ? "Your assigned projects will appear here." : "Create your first project to get started."}
                    </div>
                `
            }
        </div>
    `;
}

function openProject(pid) {

    if (current?.role !== "owner") {
    return toast("Only the owner can manage projects");
}
    const p = db.projects.find(x => x.id === pid) || {};
    const employees = db.users.filter(u => u.role === "employee" && u.active !== false);

    modal(
        pid ? "Edit project" : "Create project",

        `
            <div class="form-grid">
                ${field("Project name", "name", "text", p.name || "")}

                ${field(
                    "Status",
                    "status",
                    "text",
                    p.status || "Active",
                    true,
                    ["Active", "On Hold", "Completed"].map(x => ({
                        value: x,
                        label: x
                    }))
                )}

                <div class="wide">
                    ${field("Description", "description", "textarea", p.description || "", false)}
                </div>

                ${field("Due date", "due", "date", p.due || "", false)}

                
<div class="field">
    <label>Team members</label>

    <div style="border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;max-height:280px;overflow-y:auto;">
        ${
            employees.length
                ? employees
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(u => `
                        <label style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--line);border-radius:10px;cursor:pointer;min-width:0;">
                            <input
                                type="checkbox"
                                name="members"
                                value="${u.id}"
                                ${(p.members || []).includes(u.id) ? "checked" : ""}
                                style="flex-shrink:0;width:16px;height:16px;"
                            >

                            <div style="display:flex;flex-direction:column;gap:5px;min-width:0;">
                                <b style="font-size:13px;">${esc(u.name)}</b>
                                <span style="font-size:12px;color:var(--muted);overflow-wrap:anywhere;">${esc(u.email)}</span>
                            </div>
                        </label>
                    `).join("")
                : `<p class="muted">No active employees found.</p>`
        }
    </div>
</div>
        `,

        "Save project",

        async f => {
            const name = String(f.get("name") || "").trim();
            if (!name) return toast("Project name is required");

            const newStatus = f.get("status");

const data = {
    id: pid || id(),
    name,
    status: newStatus,
    description: f.get("description"),
    due: f.get("due"),
    members: f.getAll("members"),
    owner: current.id,

    // Keep previous completion information
    completedAt: p.completedAt || "",
    completedBy: p.completedBy || ""
};

// ================= PROJECT COMPLETION =================

if (newStatus === "Completed") {

    // Only create completion information
    // when project becomes completed.
    if (p.status !== "Completed") {

        data.completedAt = dateToday();

        data.completedBy = current.id;
        data.completedByName = current.name;

data.memberSnapshots = (data.members || []).map(uid => {
    const u = userBy(uid);

    return {
        id: uid,
        name: u?.name || "Former Employee",
        email: u?.email || "",
        photo: u?.photo || ""
    };
});
        data.completedByName = current.name;

data.memberSnapshots = (data.members || []).map(uid => {
    const u = userBy(uid);

    return {
        id: uid,
        name: u?.name || "Former Employee",
        email: u?.email || "",
        photo: u?.photo || ""
    };
});
    }

} else {

    // If project is reopened,
    // remove previous completion information.
    data.completedAt = "";
    data.completedBy = "";
}

            try {
                let savedProject;

                if (pid) {
                    savedProject = await api(`/api/projects/${encodeURIComponent(pid)}`, {
                        method: "PUT",
                        body: JSON.stringify(projectPayload(data))
                    });
                } else {
                    const createPayload = {
                        ...projectPayload(data),
                        status: newStatus === "Completed" ? "Active" : newStatus
                    };

                    savedProject = await api("/api/projects", {
                        method: "POST",
                        body: JSON.stringify(createPayload)
                    });

                    if (newStatus === "Completed") {
                        savedProject = await api(
                            `/api/projects/${encodeURIComponent(savedProject.id)}/complete?completed_by=${encodeURIComponent(current.id)}`,
                            { method: "POST" }
                        );
                    }
                }

                await fetchBackendData();
                closeModal();
                renderPage();

                toast(
                    newStatus === "Completed"
                        ? "Project completed and added to Completed Projects"
                        : "Project saved"
                );
            } catch (error) {
                console.error("Project API save error:", error);
                toast(error.message || "Could not save project");
            }
            return;

closeModal();

renderPage();

if (newStatus === "Completed") {

    toast("Project completed and added to Completed Projects");

} else {

    toast("Project saved");
}
        }
    );
}

// ================= TASKS =================

function taskList(ts, employeeMode = false) {
    return ts.length
        ? `
            <div class="task-list">
                ${ts.map(t => `
                    <div class="task-card">
                        <div style="min-width:0;flex:1">
                            <h4>${esc(t.title)}</h4>
                            <p>
                                ${esc(t.description || "No description")}<br>
                                <span class="muted">
                                   ${esc(projectBy(t.project)?.name || "Unassigned Project")}
${employeeMode
    ? ""
    : ` · ${esc(userBy(t.assignee)?.name || "Unassigned")}`
}
                                </span>
                            </p>

                            <div class="task-meta">
                                ${statusBadge(t.status)}
                                <span class="badge">${esc(t.priority || "Medium")} priority</span>
                                <span class="muted" style="font-size:11px">Due ${fmt(t.due)}</span>
                            </div>
                        </div>

                        <div class="task-actions">
                            ${
                                employeeMode && t.status !== "Completed"
                                    ? `<button class="btn secondary small" onclick="cycleTask('${t.id}')">${t.status === "In Progress" ? "Complete" : "Start"}</button>`
                                    : !employeeMode
                                        ? `<button class="btn ghost small" onclick="openTask('${t.project}','${t.id}')">Edit</button>`
                                        : ""
                            }

                            ${
                                !employeeMode
                                    ? `<button class="btn danger small" onclick="deleteTask('${t.id}')">×</button>`
                                    : ""
                            }
                        </div>
                    </div>
                `).join("")}
            </div>
        `
        : `<div class="empty"><b>No tasks found</b>Tasks assigned to you will appear here.</div>`;
}

function tasksPage(mine) {

    const ts = mine
        ? myTasks()
        : db.tasks;

    return `
        ${head(
            mine
                ? "My Tasks"
                : "Task Management",

            mine
                ? "Track and update your assigned work."
                : "Assign, track and manage all team tasks.",

            mine
                ? ""
                : `
                    <button
                        class="btn"
                        type="button"
                        onclick="openTask()"
                    >
                        ＋ Create task
                    </button>
                `
        )}

        <div class="panel">

            <div class="toolbar">

                <input
                    class="search"
                    id="taskSearch"
                    placeholder="Search tasks…"
                >

                <select id="taskFilter">
                    <option value="">All statuses</option>
                    <option>To Do</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                </select>

                <select id="priorityFilter">
                    <option value="">All priorities</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                </select>

            </div>

            <div id="taskResults">
                ${taskList(ts, mine)}
            </div>

        </div>
    `;
}


function openTask(projectId = "", taskId = "") {

    if (current?.role !== "owner") {
    return toast("Only the owner can manage tasks");
}
    const t = db.tasks.find(x => x.id === taskId) || {};
    const employees = db.users.filter(u => u.role === "employee" && u.active !== false);
    const projects = db.projects;

    if (!projects.length) {
        return toast("Create a project first");
    }

    modal(
        taskId ? "Edit task" : "Create task",

        `
            <div class="form-grid">
                ${field("Task title", "title", "text", t.title || "")}

                ${field(
                    "Project",
                    "project",
                    "text",
                    t.project || projectId,
                    true,
                    projects.map(p => ({ value: p.id, label: p.name }))
                )}

                <div class="wide">
                    ${field("Description", "description", "textarea", t.description || "", false)}
                </div>

                ${field(
                    "Assign to",
                    "assignee",
                    "text",
                    t.assignee || "",
                    true,
                    employees.map(u => ({ value: u.id, label: u.name }))
                )}

                ${field(
                    "Status",
                    "status",
                    "text",
                    t.status || "To Do",
                    true,
                    ["To Do", "In Progress", "Completed"].map(x => ({
                        value: x,
                        label: x
                    }))
                )}

                ${field(
                    "Priority",
                    "priority",
                    "text",
                    t.priority || "Medium",
                    true,
                    ["High", "Medium", "Low"].map(x => ({
                        value: x,
                        label: x
                    }))
                )}

                ${field("Due date", "due", "date", t.due || "", false)}
            </div>
        `,

        "Save task",

        async f => {
            const title = String(f.get("title") || "").trim();
            const project = f.get("project");
            const assignee = f.get("assignee");

            if (!title) return toast("Task title is required");
            if (!project) return toast("Select a project");
            if (!assignee) return toast("Select an employee");

            const data = {
                id: taskId || id(),
                title,
                project,
                description: f.get("description"),
                assignee,
                status: f.get("status"),
                priority: f.get("priority"),
                due: f.get("due"),
                createdBy: current.id
            };

            try {
                const savedTask = taskId
                    ? await api(`/api/tasks/${encodeURIComponent(taskId)}`, {
                        method: "PUT",
                        body: JSON.stringify(taskPayload(data))
                    })
                    : await api("/api/tasks", {
                        method: "POST",
                        body: JSON.stringify(taskPayload(data))
                    });

                void savedTask;
                await fetchBackendData();
                closeModal();
                renderPage();
                toast("Task saved");
            } catch (error) {
                console.error("Task API save error:", error);
                toast(error.message || "Could not save task");
            }
            return;

closeModal();
renderPage();
toast("Task saved");
        }
    );
}

async function cycleTask(tid) {
    const t = db.tasks.find(x => x.id === tid);
    if (!t) return;

    if (current.role !== "owner" && t.assignee !== current.id) {
        return toast("You can only update your own tasks");
    }

    const newStatus =
        t.status === "To Do"
            ? "In Progress"
            : t.status === "In Progress"
                ? "Completed"
                : "To Do";

    try {
        await api(`/api/tasks/${encodeURIComponent(tid)}`, {
            method: "PUT",
            body: JSON.stringify({
                status: newStatus
            })
        });

        await fetchBackendData();

        renderPage();

        toast("Task updated: " + newStatus);
    } catch (error) {
        console.error("Task status update error:", error);
        toast(error.message || "Could not update task");
    }
}

function deleteTask(tid) {
    if (current?.role !== "owner") {
        return toast("Only the owner can delete tasks");
    }

    if (!confirm("Delete this task?")) return;

    const oldTasks = db.tasks;

    db.tasks = db.tasks.filter(t => t.id !== tid);

    if (!save()) {
        db.tasks = oldTasks;
        return;
    }

    renderPage();
    toast("Task deleted");
}

// ================= REPORTS =================

function reportsPage() {
    const mine = current.role !== "owner";

    const rs = mine
        ? db.reports.filter(r => r.user === current.id)
        : db.reports;

    return `
        <div class="panel">

            <div class="panel-head">

                <div>
                    <h3>Daily Work Reports</h3>

                    <p class="muted">
                        ${
                            mine
                                ? "Submit your daily progress and blockers."
                                : "Review employee daily updates."
                        }
                    </p>
                </div>

                ${
                    current.role === "employee"
                        ? `
                            <button
                                type="button"
                                class="btn small"
                                onclick="openReport()"
                            >
                                ＋ Submit report
                            </button>
                        `
                        : `
                            <button
                                type="button"
                                class="btn secondary small"
                                onclick="recoverUnassignedRecords()"
                            >
                                Recover Unassigned
                            </button>
                        `
                }

            </div>

            <div class="toolbar">
                ${
                    mine
                        ? ""
                        : `
                            <input
                                class="search"
                                id="reportSearch"
                                placeholder="Search employee or report…"
                            >
                        `
                }
            </div>

            <div id="reportsResults">
                ${reportList(rs)}
            </div>

        </div>
    `;
}


function reportList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return `
            <div class="empty">
                <b>No reports yet</b>
                <p>Submitted daily reports will appear here.</p>
            </div>
        `;
    }

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>EMPLOYEE</th>
                        <th>DATE</th>
                        <th>WORK COMPLETED</th>
                        <th>BLOCKERS</th>
                    </tr>
                </thead>
                <tbody>
                    ${arr.slice().reverse().map(r => `
                        <tr>
                            <td>
    <b>
        ${esc(
    r.employeeName ||
    userBy(r.user)?.name ||
    "Unassigned"
)}
    </b>
</td>
                            <td>${fmt(r.date)}</td>
                            <td>${esc(r.done || "—")}</td>
                            <td>${esc(r.blockers || "None")}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function openReport() {

    if (!current || current.role !== "employee") {
    return toast("Employee login is required to submit a daily report");
}
    modal(
        "Submit Daily Report",
        `
            ${field("Report date", "date", "date", dateToday())}
            ${field("Work completed today", "done", "textarea", "")}
            ${field("Blockers / Issues", "blockers", "textarea", "", false)}
        `,
        "Submit report",
        async f => {
            const date = f.get("date");
            const done = String(f.get("done") || "").trim();
            const blockers = String(f.get("blockers") || "").trim();

            if (!date) return toast("Select report date");
            if (!done) return toast("Enter the work completed");

            const report = {
                id: id(),
                user: current.id,
                employeeName: current.name,
                employeeEmail: current.email,
                date,
                done,
                blockers
            };

            try {
                await api("/api/reports", {
                    method: "POST",
                    body: JSON.stringify(reportPayload(report))
                });

                await fetchBackendData();
                closeModal();
                renderPage();
                toast("Daily report submitted successfully");
            } catch (error) {
                console.error("Report API save error:", error);
                toast(error.message || "Could not submit report");
            }
            return;

closeModal();
renderPage();
toast("Daily report submitted successfully");
        }
    );
}

// ================= LEAVES =================

function leavesPage() {
    const mine = current.role !== "owner";

    const ls = mine
        ? db.leaves.filter(l => l.user === current.id)
        : db.leaves;

    return `
        <div class="panel">

            <div class="panel-head">

                <div>
                    <h3>Leave Management</h3>

                    <p class="muted">
                        ${
                            mine
                                ? "Request time off and track request status."
                                : "Review and manage employee leave requests."
                        }
                    </p>
                </div>

                ${
                    mine
                        ? `
                            <button
                                type="button"
                                class="btn small"
                                onclick="openLeave()"
                            >
                                ＋ Request leave
                            </button>
                        `
                        : ""
                }

            </div>

            <div class="table-wrap">

                ${
                    ls.length
                        ? `
                            <table>

                                <thead>
                                    <tr>
                                        <th>EMPLOYEE</th>
                                        <th>LEAVE TYPE</th>
                                        <th>DATES</th>
                                        <th>REASON</th>
                                        <th>STATUS</th>
                                        ${mine ? "" : "<th>ACTION</th>"}
                                    </tr>
                                </thead>

                                <tbody>

                                    ${ls
                                        .slice()
                                        .reverse()
                                        .map(l => `
                                            <tr>

                                                <td>
    <b>
       ${esc(
    l.employeeName ||
    userBy(l.user)?.name ||
    "Unassigned"
)}
    </b>
</td>

                                                <td>
                                                    ${esc(l.type)}
                                                </td>

                                                <td>
                                                    ${fmt(l.from)} – ${fmt(l.to)}
                                                </td>

                                                <td>
                                                    ${esc(l.reason)}
                                                </td>

                                                <td>
                                                    ${statusBadge(l.status)}
                                                </td>

                                                ${
                                                    mine
                                                        ? ""
                                                        : `
                                                            <td>
                                                                ${
                                                                    l.status === "Pending"
                                                                        ? `
                                                                            <button
                                                                                type="button"
                                                                                class="btn secondary small"
                                                                                onclick="leaveDecision('${l.id}','Approved')"
                                                                            >
                                                                                Approve
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                class="btn danger small"
                                                                                onclick="leaveDecision('${l.id}','Rejected')"
                                                                            >
                                                                                Reject
                                                                            </button>
                                                                        `
                                                                        : "—"
                                                                }
                                                            </td>
                                                        `
                                                }

                                            </tr>
                                        `)
                                        .join("")}

                                </tbody>

                            </table>
                        `
                        : `
                            <div class="empty">
                                <b>No leave requests</b>
                                Leave requests will appear here.
                            </div>
                        `
                }

            </div>

        </div>
    `;
}


function openLeave() {
    if (!current || current.role === "owner") {
        return toast("Employee login is required to request leave");
    }

    modal(
        "Request Leave",
        `
            ${field(
                "Leave type",
                "type",
                "text",
                "Casual Leave",
                true,
                [
                    { value: "Casual Leave", label: "Casual Leave" },
                    { value: "Sick Leave", label: "Sick Leave" },
                    { value: "Earned Leave", label: "Earned Leave" },
                    { value: "Other", label: "Other" }
                ]
            )}

            ${field("From date", "from", "date", dateToday())}
            ${field("To date", "to", "date", dateToday())}
            ${field("Reason", "reason", "textarea", "")}
        `,
        "Submit request",
        async f => {
            const type = f.get("type");
            const from = f.get("from");
            const to = f.get("to");
            const reason = String(f.get("reason") || "").trim();

            if (!from || !to) {
                return toast("Select both leave dates");
            }

            if (to < from) {
                return toast("To date cannot be before from date");
            }

            if (!reason) {
                return toast("Enter the leave reason");
            }

            const leave = {
                id: id(),
                user: current.id,
                employeeName: current.name,
                employeeEmail: current.email,
                type,
                from,
                to,
                reason,
                status: "Pending"
            };

            try {
                await api("/api/leaves", {
                    method: "POST",
                    body: JSON.stringify(leavePayload(leave))
                });

                await fetchBackendData();
                closeModal();
                renderPage();
                toast("Leave request submitted successfully");
            } catch (error) {
                console.error("Leave API save error:", error);
                toast(error.message || "Could not submit leave request");
            }
            return;

closeModal();
renderPage();
toast("Leave request submitted successfully");
        }
    );
}

function leaveDecision(leaveId, decision) {
    if (current?.role !== "owner") {
        return toast("Only the owner can review leave requests");
    }

    if (!["Approved", "Rejected"].includes(decision)) {
        return toast("Invalid leave decision");
    }

    const leave = db.leaves.find(l => l.id === leaveId);

    if (!leave) {
        return toast("Leave request not found");
    }

    if (leave.status !== "Pending") {
        return toast("This leave request has already been reviewed");
    }

   const oldStatus = leave.status;

leave.status = decision;

if (!save()) {
    leave.status = oldStatus;
    return;
}

renderPage();
toast("Leave request " + decision.toLowerCase());
}
// ================= ANNOUNCEMENTS =================

function announcementList(arr, canDelete = false) {
    return arr.length
        ? arr.map(a => `
            <div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
                <div style="min-width:0;flex:1">
                    <b>${esc(a.title)}</b>
                    <p class="muted" style="margin:7px 0">${esc(a.body)}</p>
                    <span class="muted" style="font-size:11px">${fmt(a.date)}</span>
                </div>

                ${
                    canDelete
                        ? `<button class="btn danger small" onclick="deleteAnnouncement('${a.id}')">Delete</button>`
                        : ""
                }
            </div>
        `).join("")
        : `<div class="empty">No announcements yet.</div>`;
}

function announcementsPage() {
    return `
        ${head(
            "Announcements",
            "Share updates with your team.",
            `<button class="btn" onclick="openAnnouncement()">＋ New announcement</button>`
        )}

        <div class="panel">
            ${announcementList(db.announcements.slice().reverse(), current.role === "owner")}
        </div>
    `;
}

function openAnnouncement() {
    if (current?.role !== "owner") {
        return toast("Only the owner can publish announcements");
    }

    modal(
        "New announcement",
        `${field("Title", "title")}${field("Message", "body", "textarea")}`,
        "Publish",
        async f => {
            const title = String(f.get("title") || "").trim();
            const body = String(f.get("body") || "").trim();

            if (!title || !body) {
                return toast("Title and message are required");
            }

            const announcement = {
                id: id(),
                title,
                body,
                date: dateToday(),
                by: current.id
            };

            try {
                await api(
                    `/api/announcements?created_by=${encodeURIComponent(current.id)}`,
                    {
                        method: "POST",
                        body: JSON.stringify(announcementPayload(announcement))
                    }
                );

                await fetchBackendData();
                closeModal();
                renderPage();
                toast("Announcement published");
            } catch (error) {
                console.error("Announcement API save error:", error);
                toast(error.message || "Could not publish announcement");
            }
            return;

closeModal();
            renderPage();
            toast("Announcement published");
        }
    );
}


function deleteAnnouncement(aid) {
    if (current?.role !== "owner") {
        return toast("Only the owner can delete announcements");
    }

    if (!confirm("Delete this announcement?")) {
        return;
    }

    const oldAnnouncements = db.announcements;

    db.announcements = db.announcements.filter(
        a => a.id !== aid
    );

    if (!save()) {
        db.announcements = oldAnnouncements;
        return;
    }

    renderPage();
    toast("Announcement deleted");
}

// ================= PROFILE =================


function openMyProfile() {
    const u = current;

    if (!u) {
        toast("Please log in first");
        return;
    }

    modal(
        "My Profile",

        `
            <div class="profile-photo-field">

                <div
                    class="profile-preview"
                    id="profilePhotoPreview"
                >
                    ${
                        u.photo
                            ? `
                                <img
                                    src="${u.photo}"
                                    alt="Profile photo"
                                >
                            `
                            : esc(
                                initials(
                                    u.name || ""
                                )
                            )
                    }
                </div>

                <div class="field">

                    <label>
                        Change profile photo
                    </label>

                    <input
                        id="profilePhotoInput"
                        name="photo"
                        type="file"
                        accept="image/*"
                    >

                    <small class="muted">
                        Choose a photo from your device.
                        It will be saved in this browser.
                    </small>

                </div>

            </div>

            <div class="form-grid">

                ${field(
                    "Full name",
                    "name",
                    "text",
                    u.name || ""
                )}

                <div class="field">

                    <label>Login Email</label>

                    <input
                        id="myProfileEmail"
                        name="email"
                        type="email"
                        value="${esc(u.email || "")}"
                        readonly
                        required
                        style="background:var(--surface-2);cursor:not-allowed;"
                    >

                    <small class="muted">
    ${
        u.role === "employee"
            ? "Login email is generated automatically from your name."
            : "Owner login email is fixed."
    }
</small>

                </div>

                ${field(
                    "Job title",
                    "title",
                    "text",
                    u.title || "",
                    false
                )}

                ${field(
                    "Department",
                    "department",
                    "text",
                    u.department || "",
                    false
                )}

            </div>
        `,

        "Save profile",

        async f => {

            const name = String(
                f.get("name") || ""
            ).trim();

            if (!name) {
                return toast(
                    "Name is required"
                );
            }

            let email = u.email || "";

            // If name changed, regenerate email.
            // Only employees get automatic company email.
// Owner keeps the fixed owner login email.
if (
    u.role === "employee" &&
    name.toLowerCase() !==
    String(u.name || "").trim().toLowerCase()
) {
    email = generateEmployeeEmail(
        name,
        u.id
    );
}

            if (!email) {
                return toast(
                    "Could not generate login email"
                );
            }

            let photo = u.photo || "";

            try {

                const file = f.get("photo");

                if (
                    file &&
                    file.size > 0
                ) {
                    photo =
                        await photoToDataURL(file);
                }

                const oldData = {
                    name: u.name,
                    email: u.email,
                    title: u.title,
                    department: u.department,
                    photo: u.photo || ""
                };

                Object.assign(
    u,
    {
        name,
        email,
        title: String(
            f.get("title") || ""
        ).trim(),
        department: String(
            f.get("department") || ""
        ).trim(),
        photo
    }
);

current = u;

const saved = save();

if (!saved) {

    Object.assign(
        u,
        oldData
    );

    current = u;

    return;
}

closeModal();

render();

toast(
    "Profile updated successfully"
);

            } catch (err) {

                console.error(
                    "Profile save error:",
                    err
                );

                toast(
                    err.message ||
                    "Could not save profile. Please try again."
                );
            }
        }
    );

    // ================= PHOTO PREVIEW =================

    const photoInput =
        $("#profilePhotoInput");

    const preview =
        $("#profilePhotoPreview");

    if (
        photoInput &&
        preview
    ) {

        photoInput.onchange =
            async () => {

                const file =
                    photoInput.files?.[0];

                if (!file) return;

                try {

                    const photo =
                        await photoToDataURL(file);

                    preview.innerHTML =
                        `
                            <img
                                src="${photo}"
                                alt="Selected profile photo"
                            >
                        `;

                } catch (err) {

                    toast(
                        err.message ||
                        "Could not preview image"
                    );

                }
            };
    }

    // ================= AUTO EMAIL WHILE TYPING NAME =================

    const nameInput =
        document.querySelector(
            '#modalForm input[name="name"]'
        );

    const emailInput =
        document.querySelector(
            '#modalForm input[name="email"]'
        );

    if (
        nameInput &&
        emailInput
    ) {

        nameInput.addEventListener(
    "input",
    () => {

        const name =
            nameInput.value.trim();

        // Owner email must always remain unchanged
        if (u.role !== "employee") {
            emailInput.value = u.email || "";
            return;
        }

        if (!name) {
            emailInput.value = "";
            return;
        }

        // Employee name unchanged
        if (
            name.toLowerCase() ===
            String(
                u.name || ""
            ).trim().toLowerCase()
        ) {
            emailInput.value =
                u.email || "";

            return;
        }

        // Employee name changed
        emailInput.value =
            generateEmployeeEmail(
                name,
                u.id
            );
    }
);
    }
}
// ================= SEARCH & FILTERS =================

function bindPage() {
    if ($("#empSearch")) {
        $("#empSearch").oninput = () => {
            const q = $("#empSearch").value.toLowerCase();

            $("#employeeTable").innerHTML = employeeTable(
                db.users.filter(u =>
                    u.role === "employee" &&
                    [u.name, u.email, u.department]
                        .join(" ")
                        .toLowerCase()
                        .includes(q)
                )
            );
        };
    }

    if ($("#taskSearch")) {
        const refresh = () => {
            const q = $("#taskSearch").value.toLowerCase();
            const s = $("#taskFilter").value;
            const pr = $("#priorityFilter").value;

            const ts = (page === "mytasks" ? myTasks() : db.tasks).filter(t =>
                (t.title + " " + (t.description || "")).toLowerCase().includes(q) &&
                (!s || t.status === s) &&
                (!pr || t.priority === pr)
            );

            $("#taskResults").innerHTML = taskList(ts, page === "mytasks");
        };

        $("#taskSearch").oninput = refresh;
        $("#taskFilter").onchange = refresh;
        $("#priorityFilter").onchange = refresh;
    }

    if ($("#reportSearch")) {
        $("#reportSearch").oninput = () => {
            const q = $("#reportSearch").value.toLowerCase();

            $("#reportsResults").innerHTML = reportList(
                db.reports.filter(r =>
    (
    r.employeeName ||
    userBy(r.user)?.name ||
    "Unassigned"
).toLowerCase().includes(q) ||
    (
        r.done || ""
    ).toLowerCase().includes(q) ||
    (
        r.blockers || ""
    ).toLowerCase().includes(q)
)
            );
        };
    }
}


function closeModal() {
    document.querySelector("#modalBack")?.remove();
}

// ================= MODAL & FORM HELPERS =================

function modal(title, body, submitText, fn) {
    document.querySelector("#modalBack")?.remove();

    const showLogout = title === "My Profile";

    document.body.insertAdjacentHTML("beforeend", `
        <div class="modal-back" id="modalBack">
            <form class="modal" id="modalForm">

                <div class="modal-head">
                    <h2>${title}</h2>

                    <button
                        type="button"
                        class="btn ghost small"
                        id="modalCloseBtn"
                    >✕</button>
                </div>

                ${body}

                <div class="modal-actions">
                    ${showLogout ? `
                        <button
                            type="button"
                            class="btn danger"
                            id="modalLogoutBtn"
                        >Logout</button>
                    ` : ""}

                    <button
                        type="button"
                        class="btn ghost"
                        id="modalCancelBtn"
                    >Cancel</button>

                    <button
                        type="submit"
                        class="btn"
                    >${submitText}</button>
                </div>
            </form>
        </div>
    `);

    document.querySelector("#modalCloseBtn")
        .addEventListener("click", closeModal);

    document.querySelector("#modalCancelBtn")
        .addEventListener("click", closeModal);

    document.querySelector("#modalLogoutBtn")
        ?.addEventListener("click", logout);

    document.querySelector("#modalForm")
        .addEventListener("submit", async function (e) {
            e.preventDefault();
            await fn(new FormData(e.currentTarget));
        });
}
// ================= LOGOUT =================

function logout() {
    current = null;
    page = "dashboard";

    closeModal();
    loginView();

    toast("Logged out successfully");
}

// ================= FORM FIELD HELPER =================

function field(
    label,
    name,
    type = "text",
    value = "",
    required = true,
    opts = null
) {
    return `
        <div class="field">
            <label>${label}</label>

            ${
                opts
                    ? `
                        <select name="${name}" ${required ? "required" : ""}>
                            ${
                                opts.map(o => `
                                    <option value="${esc(o.value)}"
                                        ${
                                            String(o.value) === String(value)
                                                ? "selected"
                                                : ""
                                        }>
                                        ${esc(o.label)}
                                    </option>
                                `).join("")
                            }
                        </select>
                    `
                    : type === "textarea"
                        ? `
                            <textarea name="${name}" rows="3"
                                ${required ? "required" : ""}>${esc(value)}</textarea>
                        `
                        : `
                            <input
                                name="${name}"
                                type="${type}"
                                value="${esc(value)}"
                                ${required ? "required" : ""}
                                ${type === "number" ? 'min="0" step="0.5"' : ""}
                            >
                        `
            }
        </div>
    `;
}

// ================= NAVIGATION =================

function go(p) {
    page = p;
    render();
}

// ================= INITIALIZATION =================

if (!localStorage.getItem(KEY)) {
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch (_) {}
}

loginView();

// ================= EMPLOYEE PAGE =================

function employeesPage() {

    const employees = db.users.filter(
        u => u.role === "employee"
    );

    return `
        ${head(
            "Employee Management",
            "Manage employee accounts, profiles and documents.",
            `
                <button
                    class="btn"
                    type="button"
                    onclick="openEmployee()"
                >
                    ＋ Add Employee
                </button>
            `
        )}

        <div class="panel">

            <div class="toolbar">

                <input
                    class="search"
                    id="empSearch"
                    placeholder="Search employee..."
                >

            </div>

            <div id="employeeTable">
                ${employeeTable(employees)}
            </div>

        </div>
    `;
}


// ================= DELETE EMPLOYEE =================


function deleteEmployee(uid) {

    // Owner cannot be deleted
    if (uid === "owner") {
        return toast("Owner cannot be deleted");
    }

    // Find employee
    const employee = db.users.find(u => u.id === uid);

    if (!employee) {
        return toast("Employee not found");
    }

    // Only employee accounts can be deleted
    if (employee.role !== "employee") {
        return toast("Only employee accounts can be deleted");
    }

    // Confirm delete
    const ok = confirm(
        `Delete employee "${employee.name}"?\n\n` +
        `This employee may be linked to projects, tasks, reports, or leaves.`
    );

    if (!ok) {
        return;
    }

    // Backup everything before changing
    const oldUsers = JSON.parse(JSON.stringify(db.users));
    const oldProjects = JSON.parse(JSON.stringify(db.projects));
    const oldTasks = JSON.parse(JSON.stringify(db.tasks));
    const oldReports = JSON.parse(JSON.stringify(db.reports));
    const oldLeaves = JSON.parse(JSON.stringify(db.leaves));

    // --------------------------------------------------
    // 1. DELETE EMPLOYEE
    // --------------------------------------------------

    db.users = db.users.filter(u => u.id !== uid);

    // --------------------------------------------------
    // 2. REMOVE EMPLOYEE FROM PROJECT MEMBERS
    // --------------------------------------------------

    db.projects = db.projects.map(p => {

    // Keep completed project history unchanged
    if (p.status === "Completed") {
        return p;
    }

    if (Array.isArray(p.members)) {
        p.members = p.members.filter(
            memberId => memberId !== uid
        );
    }

    if (p.owner === uid) {
        p.owner = "";
    }

    return p;
});

    // --------------------------------------------------
    // 3. REMOVE EMPLOYEE FROM TASK ASSIGNMENT
    // --------------------------------------------------

    db.tasks = db.tasks.map(t => {

        if (t.assignee === uid) {
            t.assignee = "";
        }

        if (t.assigneeId === uid) {
            t.assigneeId = "";
        }

        if (t.employeeId === uid) {
            t.employeeId = "";
        }

        return t;
    });

    // --------------------------------------------------
// 4. KEEP REPORTS
// --------------------------------------------------
// Reports are historical records.
// Keep employee name even after employee deletion.

db.reports = db.reports.map(r => {

    if (r.user === uid) {
        r.employeeName = employee.name;
        r.employeeEmail = employee.email;
        r.user = "";
    }

    if (r.employeeId === uid) {
        r.employeeName = employee.name;
        r.employeeEmail = employee.email;
        r.employeeId = "";
    }

    if (r.userId === uid) {
        r.employeeName = employee.name;
        r.employeeEmail = employee.email;
        r.userId = "";
    }

    if (r.createdBy === uid) {
        r.createdBy = "";
    }

    return r;
});

    // --------------------------------------------------
// 5. KEEP LEAVE RECORDS
// --------------------------------------------------
// Leave history is preserved.
// Keep employee name even after employee deletion.

db.leaves = db.leaves.map(l => {

    if (l.user === uid) {
        l.employeeName = employee.name;
        l.employeeEmail = employee.email;
        l.user = "";
    }

    if (l.employeeId === uid) {
        l.employeeName = employee.name;
        l.employeeEmail = employee.email;
        l.employeeId = "";
    }

    if (l.userId === uid) {
        l.employeeName = employee.name;
        l.employeeEmail = employee.email;
        l.userId = "";
    }

    return l;
});

    // --------------------------------------------------
    // 6. SAVE
    // --------------------------------------------------

    if (!save()) {

        // Rollback everything if save fails
        db.users = oldUsers;
        db.projects = oldProjects;
        db.tasks = oldTasks;
        db.reports = oldReports;
        db.leaves = oldLeaves;

        return toast("Could not delete employee. Storage save failed.");
    }

    // --------------------------------------------------
    // 7. CLOSE MODAL
    // --------------------------------------------------

    closeModal();

    // --------------------------------------------------
    // 8. REFRESH PAGE
    // --------------------------------------------------

    renderPage();

    // --------------------------------------------------
    // 9. SUCCESS
    // --------------------------------------------------

    toast(`Employee "${employee.name}" deleted successfully`);
}

// ================= REMOVE EMPLOYEE PHOTO =================

function removeEmployeePhoto(uid) {

    const employee = db.users.find(
        u => u.id === uid
    );

    if (!employee) {
        return toast("Employee not found");
    }

    const oldPhoto = employee.photo;

    employee.photo = "";

    if (!save()) {
        employee.photo = oldPhoto;
        return;
    }

    closeModal();
    openEmployee(uid);

    toast("Profile photo removed");
}



function viewEmployee(uid) {

    const u =
        db.users.find(
            x => x.id === uid
        );

    if (!u) {
        return toast(
            "Employee not found"
        );
    }


    const documents =
        u.documents || {};


    const documentRow = (
        label,
        key
    ) => {

        const doc =
            documents[key];


        if (!doc) {

            return `
                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        padding:10px 0;
                        border-bottom:1px solid var(--line);
                    "
                >
                    <span>
                        ${esc(label)}
                    </span>

                    <span class="muted">
                        Not uploaded
                    </span>
                </div>
            `;
        }


        return `
            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:10px;
                    padding:10px 0;
                    border-bottom:1px solid var(--line);
                "
            >

                <div>

                    <b>
                        ${esc(label)}
                    </b>

                    <div class="muted">
                        ${esc(doc.name)}
                    </div>

                </div>


                <a
                    class="btn ghost small"
                    href="${doc.data}"
                    target="_blank"
                    download="${esc(doc.name)}"
                >
                    View / Download
                </a>

            </div>
        `;
    };


    modal(

        "Employee Details",

        `

        <!-- ================= PERSONAL DETAILS ================= -->

        <div
            style="
                display:flex;
                align-items:center;
                gap:15px;
                margin-bottom:20px;
            "
        >

            ${avatarMarkup(
                u,
                "profile-preview"
            )}

            <div>

                <h3 style="margin:0;">
                    ${esc(u.name)}
                </h3>

                <div class="muted">
                    ${esc(
                        u.designation ||
                        u.title ||
                        "Employee"
                    )}
                </div>

            </div>

        </div>


        <h3>
            Employee Details
        </h3>


        <div class="form-grid">

            <div class="field">
                <label>Name</label>
                <input
                    value="${esc(u.name || "")}"
                    readonly
                >
            </div>


            <div class="field">
                <label>Email</label>
                <input
                    value="${esc(u.email || "")}"
                    readonly
                >
            </div>


            <div class="field">
                <label>Phone</label>
                <input
                    value="${esc(u.phone || "—")}"
                    readonly
                >
            </div>


            <div class="field">
                <label>Designation</label>
                <input
                    value="${esc(
                        u.designation ||
                        u.title ||
                        "—"
                    )}"
                    readonly
                >
            </div>


            <div class="field">
                <label>Department</label>
                <input
                    value="${esc(
                        u.department ||
                        "—"
                    )}"
                    readonly
                >
            </div>


            <div class="field">
                <label>Joining Date</label>
                <input
                    value="${esc(
                        u.joiningDate ||
                        "—"
                    )}"
                    readonly
                >
            </div>

        </div>


        <!-- ================= DOCUMENTS ================= -->

        <h3
            style="
                margin-top:25px;
            "
        >
            Documents
        </h3>


        <div>

            ${documentRow(
                "Resume",
                "resume"
            )}

            ${documentRow(
                "Aadhaar / ID proof",
                "aadhaar"
            )}

            ${documentRow(
                "PAN",
                "pan"
            )}

            ${documentRow(
                "Degree Certificate",
                "degree"
            )}

            ${documentRow(
                "Mark Sheets",
                "marksheets"
            )}

            ${documentRow(
                "Technical Certificates",
                "technical"
            )}

        </div>

        `,

        "Close",

        () => {
            closeModal();
        }
    );
}


// ================= COMPLETED PROJECTS =================

function completedProjectsPage() {

    if (current?.role !== "owner") {
        return `
            <div class="panel">
                <div class="empty">
                    <b>Access denied</b>
                    <p>Only the owner can view completed project history.</p>
                </div>
            </div>
        `;
    }

    const completed = db.projects
        .filter(p => p.status === "Completed")
        .slice()
        .sort((a, b) => {
            return String(b.completedAt || "")
                .localeCompare(String(a.completedAt || ""));
        });

    return `
        ${head(
            "Completed Projects",
            "View all projects completed by your team."
        )}

        <div class="stats">

            ${stat(
                "Completed Projects",
                completed.length,
                "Finished projects",
                "✓"
            )}

            ${stat(
                "Completed Today",
                completed.filter(
                    p => p.completedAt === dateToday()
                ).length,
                "Projects finished today",
                "◷"
            )}

            ${stat(
                "Team Members",
                new Set(
    completed.flatMap(p =>
        Array.isArray(p.memberSnapshots)
            ? p.memberSnapshots.map(m => m.id)
            : (p.members || [])
    )
).size,
                "Members who completed projects",
                "♙"
            )}

            ${stat(
                "Total Tasks",
                db.tasks.filter(
                    t =>
                        completed.some(
                            p => p.id === t.project
                        )
                ).length,
                "Tasks across completed projects",
                "☷"
            )}

        </div>

        <div class="panel">

            <div class="panel-head">

                <div>
                    <h3>Completed Project History</h3>

                    <p class="muted">
                        Every completed project is automatically saved here.
                    </p>
                </div>

            </div>

            ${
                completed.length
                    ? `
                        <div class="table-wrap completed-projects-table">

                            <table>

                                <thead>
                                    <tr>
                                        <th>PROJECT NAME</th>
                                        <th>EMPLOYEE / TEAM</th>
                                        <th>PROJECT DETAILS</th>
                                        <th>COMPLETED BY</th>
                                        <th>COMPLETED DATE</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    ${completed.map(p => {

                                        const members = Array.isArray(p.memberSnapshots)
    ? p.memberSnapshots
    : (p.members || []).map(uid => {
        const u = userBy(uid);

        return {
            id: uid,
            name: u?.name || "Former Employee",
            email: u?.email || "",
            photo: u?.photo || ""
        };
    });

                                        const completedByUser =
                                            userBy(p.completedBy);

                                        return `
                                            <tr>

                                                <td>
                                                    <b>
                                                        ${esc(p.name)}
                                                    </b>
                                                </td>

                                                <td>

                                                    ${
                                                        members.length
                                                            ? members.map(member => `
                                                                <div
                                                                    style="
                                                                        display:flex;
                                                                        align-items:center;
                                                                        gap:8px;
                                                                        margin-bottom:6px;
                                                                    "
                                                                >

    ${avatarMarkup(
    member,
    "mini-avatar"
)}

                                                                   <span>
    ${esc(member.name || "Former Employee")}
</span>

                                                                </div>
                                                            `).join("")
                                                            : "—"
                                                    }

                                                </td>

                                                <td>

                                                    <div style="max-width:280px;">

                                                        ${
                                                            esc(
                                                                p.description ||
                                                                "No description provided."
                                                            )
                                                        }

                                                    </div>

                                                </td>

                                                <td>

                                                    <b>
                                                        ${esc(
    completedByUser?.name ||
p.completedByName ||
"Former Employee"
)}
                                                    </b>

                                                </td>

                                                <td>
                                                    ${fmt(p.completedAt)}
                                                </td>

                                                <td>
                                                    ${statusBadge("Completed")}
                                                </td>

                                            </tr>
                                        `;

                                    }).join("")}

                                </tbody>

                            </table>

                        </div>
                    `
                    : `
                        <div class="empty">

                            <b>No completed projects yet</b>

                            <p>
                                Projects will automatically appear here
                                when their status is changed to Completed.
                            </p>

                        </div>
                    `
            }

        </div>
    `;
}


// ================= RECOVER OLD UNASSIGNED RECORDS =================

javascript
function completedProjectsPage() {

    if (current?.role !== "owner") {
        return `
            <div class="panel">
                <div class="empty">
                    <b>Access denied</b>
                    <p>Only the owner can view completed project history.</p>
                </div>
            </div>
        `;
    }

    const completed = db.projects
        .filter(p => p.status === "Completed")
        .slice()
        .sort((a, b) => {
            return String(b.completedAt || "")
                .localeCompare(String(a.completedAt || ""));
        });

    return `
        ${head(
            "Completed Projects",
            "View all projects completed by your team."
        )}

        <div class="stats">
            ${stat(
                "Completed Projects",
                completed.length,
                "Finished projects",
                "✓"
            )}

            ${stat(
                "Completed Today",
                completed.filter(
                    p => p.completedAt === dateToday()
                ).length,
                "Projects finished today",
                "◷"
            )}

            ${stat(
                "Team Members",
                new Set(
                    completed.flatMap(p =>
                        Array.isArray(p.memberSnapshots)
                            ? p.memberSnapshots.map(m => m.id)
                            : (p.members || [])
                    )
                ).size,
                "Members who completed projects",
                "♙"
            )}

            ${stat(
                "Total Tasks",
                db.tasks.filter(
                    t =>
                        completed.some(
                            p => p.id === t.project
                        )
                ).length,
                "Tasks across completed projects",
                "☷"
            )}
        </div>

        <div class="panel completed-projects-panel">

            <div class="panel-head">
                <div>
                    <h3>Completed Project History</h3>
                    <p class="muted">
                        Every completed project is automatically saved here.
                    </p>
                </div>
            </div>

            ${
                completed.length
                    ? `
                        <div class="table-wrap completed-projects-table-wrap">

                            <table class="completed-projects-table">

                                <thead>
                                    <tr>
                                        <th>PROJECT NAME</th>
                                        <th>EMPLOYEE / TEAM</th>
                                        <th>PROJECT DETAILS</th>
                                        <th>COMPLETED BY</th>
                                        <th>COMPLETED DATE</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    ${completed.map(p => {

                                        const members =
                                            Array.isArray(p.memberSnapshots)
                                                ? p.memberSnapshots
                                                : (p.members || []).map(uid => {
                                                    const u = userBy(uid);

                                                    return {
                                                        id: uid,
                                                        name: u?.name || "Former Employee",
                                                        email: u?.email || "",
                                                        photo: u?.photo || ""
                                                    };
                                                });

                                        const completedByUser =
                                            userBy(p.completedBy);

                                        return `
                                            <tr class="completed-project-row">

                                                <!-- PROJECT NAME -->
                                                <td class="completed-project-name">
                                                    <div class="project-name-cell">
                                                        <div class="project-title">
                                                            ${esc(p.name)}
                                                        </div>
                                                        <span class="project-completed-dot"></span>
                                                    </div>
                                                </td>

                                                <!-- EMPLOYEE / TEAM -->
                                                <td class="completed-team-cell">

                                                    ${
                                                        members.length
                                                            ? `
                                                                <div class="team-list">
                                                                    ${members.map(member => `
                                                                        <div class="team-member">

                                                                            ${avatarMarkup(
                                                                                member,
                                                                                "mini-avatar"
                                                                            )}

                                                                            <span class="team-member-name">
                                                                                ${esc(
                                                                                    member.name ||
                                                                                    "Former Employee"
                                                                                )}
                                                                            </span>

                                                                        </div>
                                                                    `).join("")}
                                                                </div>
                                                            `
                                                            : `
                                                                <span class="muted">—</span>
                                                            `
                                                    }

                                                </td>

                                                <!-- PROJECT DETAILS -->
                                                <td class="completed-details-cell">
                                                    <div class="project-description">
                                                        ${esc(
                                                            p.description ||
                                                            "No description provided."
                                                        )}
                                                    </div>
                                                </td>

                                                <!-- COMPLETED BY -->
                                                <td class="completed-by-cell">

                                                    <div class="completed-by-user">

                                                        ${avatarMarkup(
                                                            completedByUser,
                                                            "mini-avatar"
                                                        )}

                                                        <div>
                                                            <div class="completed-by-name">
                                                                ${esc(
                                                                    completedByUser?.name ||
                                                                    p.completedByName ||
                                                                    "Former Employee"
                                                                )}
                                                            </div>

                                                            <div class="completed-by-label">
                                                                Project completed
                                                            </div>
                                                        </div>

                                                    </div>

                                                </td>

                                                <!-- COMPLETED DATE -->
                                                <td class="completed-date-cell">

                                                    <div class="completed-date">
                                                        ${fmt(p.completedAt)}
                                                    </div>

                                                </td>

                                                <!-- STATUS -->
                                                <td class="completed-status-cell">
                                                    ${statusBadge("Completed")}
                                                </td>

                                            </tr>
                                        `;

                                    }).join("")}

                                </tbody>

                            </table>

                        </div>
                    `
                    : `
                        <div class="empty">
                            <b>No completed projects yet</b>
                            <p>
                                Projects will automatically appear here
                                when their status is changed to Completed.
                            </p>
                        </div>
                    `
            }

        </div>

        <style>
            /* ================================
               COMPLETED PROJECTS UI
            ================================= */

            .completed-projects-panel {
                overflow: hidden;
            }

            .completed-projects-table-wrap {
                width: 100%;
                overflow-x: auto;
                border: 1px solid var(--border, #e5e7eb);
                border-radius: 14px;
                background: var(--card, #fff);
            }

            .completed-projects-table {
                width: 100%;
                min-width: 1050px;
                border-collapse: separate;
                border-spacing: 0;
                table-layout: fixed;
            }

            .completed-projects-table th {
                padding: 14px 16px;
                text-align: left;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .05em;
                color: var(--muted, #6b7280);
                background: var(--surface, #f8fafc);
                border-bottom: 1px solid var(--border, #e5e7eb);
                white-space: nowrap;
            }

            .completed-projects-table th:nth-child(1) {
                width: 17%;
            }

            .completed-projects-table th:nth-child(2) {
                width: 18%;
            }

            .completed-projects-table th:nth-child(3) {
                width: 30%;
            }

            .completed-projects-table th:nth-child(4) {
                width: 16%;
            }

            .completed-projects-table th:nth-child(5) {
                width: 11%;
            }

            .completed-projects-table th:nth-child(6) {
                width: 8%;
            }

            .completed-projects-table td {
                padding: 18px 16px;
                vertical-align: middle;
                border-bottom: 1px solid var(--border, #eef0f3);
                font-size: 13px;
                line-height: 1.5;
                background: var(--card, #fff);
            }

            .completed-projects-table tbody tr:last-child td {
                border-bottom: none;
            }

            .completed-project-row {
                transition: background .18s ease;
            }

            .completed-project-row:hover td {
                background: var(--surface, #fafafa);
            }

            /* Project name */

            .project-name-cell {
                display: flex;
                align-items: center;
                gap: 9px;
            }

            .project-title {
                font-weight: 700;
                color: var(--text, #111827);
                word-break: break-word;
            }

            .project-completed-dot {
                width: 7px;
                height: 7px;
                flex: 0 0 7px;
                border-radius: 50%;
                background: #22c55e;
            }

            /* Team */

            .team-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .team-member {
                display: flex;
                align-items: center;
                gap: 9px;
                min-width: 0;
            }

            .team-member-name {
                font-weight: 600;
                color: var(--text, #374151);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Details */

            .project-description {
                color: var(--muted, #6b7280);
                line-height: 1.6;
                max-width: 100%;
                word-break: break-word;
            }

            /* Completed by */

            .completed-by-user {
                display: flex;
                align-items: center;
                gap: 9px;
                min-width: 0;
            }

            .completed-by-name {
                font-weight: 700;
                color: var(--text, #374151);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .completed-by-label {
                margin-top: 2px;
                font-size: 10px;
                color: var(--muted, #9ca3af);
            }

            /* Date */

            .completed-date {
                font-weight: 600;
                color: var(--text, #374151);
                white-space: nowrap;
            }

            /* Status */

            .completed-status-cell {
                white-space: nowrap;
            }

            .completed-status-cell .badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }

            /* Mobile */

            @media (max-width: 900px) {

                .completed-projects-table {
                    min-width: 950px;
                }

                .completed-projects-table th,
                .completed-projects-table td {
                    padding: 13px 12px;
                }

            }

            @media (max-width: 600px) {

                .completed-projects-panel {
                    border-radius: 12px;
                }

                .completed-projects-table-wrap {
                    border-radius: 10px;
                }

                .completed-projects-table {
                    min-width: 900px;
                }

            }
        </style>
    `;
}

