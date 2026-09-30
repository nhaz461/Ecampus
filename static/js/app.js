// eCampus Dashboard Application Logic
let currentActiveTab = 'dashboard';
let globalSemesters = [];
let globalCourses = [];
let selectedSemesterId = null;

// On DOM Loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    highlightActiveTab('dashboard');
    await loadSemestersData();
    await loadDashboardSummary();
    checkNotificationPermissionStatus();
    startDeadlineTimerCheck();
}

// --- TAB SWITCHING ---
function switchTab(tabName) {
    currentActiveTab = tabName;
    const tabs = ['dashboard', 'semesters', 'assignments', 'files'];
    
    tabs.forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        const navBtn = document.getElementById(`nav-${t}`);
        const mobileNavBtn = document.getElementById(`mobile-nav-${t}`);
        
        if (t === tabName) {
            if (section) section.classList.remove('hidden');
            if (navBtn) navBtn.classList.add('sidebar-active');
            if (mobileNavBtn) mobileNavBtn.classList.add('mobile-nav-active');
        } else {
            if (section) section.classList.add('hidden');
            if (navBtn) navBtn.classList.remove('sidebar-active');
            if (mobileNavBtn) mobileNavBtn.classList.remove('mobile-nav-active');
        }
    });

    if (tabName === 'dashboard') loadDashboardSummary();
    if (tabName === 'semesters') loadSemestersTab();
    if (tabName === 'assignments') loadAssignmentsTab();
    if (tabName === 'files') loadFilesTab();
}

function highlightActiveTab(tabName) {
    switchTab(tabName);
}

// --- DATA FETCHING: SEMESTERS ---
async function loadSemestersData() {
    try {
        const res = await fetch('/api/semesters');
        const data = await res.json();
        if (data.status === 'success') {
            globalSemesters = data.data || [];
            populateSemesterDropdowns();
        }
    } catch (err) {
        console.error("Gagal memuat semester:", err);
    }
}

function populateSemesterDropdowns() {
    const courseSemSelect = document.getElementById('courseSemesterSelect');
    if (courseSemSelect) {
        if (!globalSemesters || globalSemesters.length === 0) {
            courseSemSelect.innerHTML = '<option value="">-- Belum Ada Semester --</option>';
        } else {
            courseSemSelect.innerHTML = globalSemesters.map(s => 
                `<option value="${s.id}">${s.name} (${s.academic_year || 'N/A'})</option>`
            ).join('');
        }
    }
}

// --- TAB 1: DASHBOARD LOGIC ---
async function loadDashboardSummary() {
    try {
        const res = await fetch('/api/dashboard/summary');
        const data = await res.json();
        if (data.status === 'success') {
            const summary = data.summary || {};
            const totalCourses = summary.total_courses || 0;
            const totalSks = summary.total_sks || 0;
            const pendingTasks = summary.pending_tasks || 0;
            const urgentTasks = summary.urgent_tasks || 0;

            document.getElementById('statTotalCourses').innerText = totalCourses;
            document.getElementById('statTotalSks').innerText = totalSks;
            document.getElementById('statPendingTasks').innerText = pendingTasks;
            document.getElementById('statUrgentTasks').innerText = urgentTasks;

            // Sidebar & Mobile nav badges
            const badgeDesktop = document.getElementById('badgePendingTasksCount');
            const badgeMobile = document.getElementById('mobileBadgePendingCount');
            if (badgeDesktop) badgeDesktop.innerText = pendingTasks;
            if (badgeMobile) badgeMobile.innerText = pendingTasks;

            // Urgent alert banner
            const banner = document.getElementById('urgentAlertBanner');
            if (urgentTasks > 0) {
                banner.classList.remove('hidden');
                document.getElementById('urgentAlertText').innerText = `Perhatian: Ada ${urgentTasks} tugas yang mendekati deadline dalam kurun 3 hari!`;
                triggerWebNotification("Pengingat Tugas eCampus", `Anda memiliki ${urgentTasks} tugas mendesak!`);
            } else {
                banner.classList.add('hidden');
            }

            // Render upcoming tasks widget
            renderUpcomingTasks(data.upcoming_tasks || []);

            // Render semester summary list
            renderDashboardSemesterList();
        }
    } catch (err) {
        console.error("Gagal memuat dashboard summary:", err);
    }
}

function renderUpcomingTasks(tasks) {
    const container = document.getElementById('dashboardUpcomingTasks');
    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-slate-500 text-xs">
                <i class="fa-solid fa-circle-check text-2xl text-emerald-500 mb-2 block"></i>
                Tidak ada tugas mendesak saat ini. Kosong!
            </div>`;
        return;
    }

    container.innerHTML = tasks.map(t => {
        const countdown = getDeadlineCountdown(t.deadline);
        let badgeClass = "badge-normal";
        if (countdown.isOverdue) badgeClass = "bg-rose-900/50 border-rose-600 text-rose-300";
        else if (countdown.hoursLeft <= 24) badgeClass = "badge-urgent animate-pulse";
        else if (countdown.hoursLeft <= 72) badgeClass = "badge-warning";

        return `
            <div class="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                        <span class="text-xs font-bold text-blue-400">${escapeHtml(t.course_name)}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded ${t.priority === 'Tinggi' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700 text-slate-300'} font-semibold">${t.priority}</span>
                    </div>
                    <h4 class="font-semibold text-white text-xs sm:text-sm leading-tight">${escapeHtml(t.title)}</h4>
                    <p class="text-[11px] text-slate-400">Deadline: ${formatDateTime(t.deadline)}</p>
                </div>
                <div class="flex items-center justify-between sm:justify-end space-x-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <div class="text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-lg border ${badgeClass}">
                        ${countdown.text}
                    </div>
                    <button onclick="toggleTaskStatus(${t.id}, 'Selesai')" title="Tandai Selesai" class="p-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition text-xs">
                        <i class="fa-solid fa-check mr-1"></i> Selesai
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderDashboardSemesterList() {
    const container = document.getElementById('dashboardSemesterList');
    if (!globalSemesters || globalSemesters.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs">Belum ada semester.</div>`;
        return;
    }

    container.innerHTML = globalSemesters.map(s => {
        const courseCount = s.course_count || 0;
        const totalSks = s.total_sks || 0;
        const pendingTasks = s.pending_tasks || 0;

        return `
            <div onclick="selectSemesterTab(${s.id})" class="p-2.5 sm:p-3 bg-slate-900/60 hover:bg-slate-700/60 border border-slate-700/80 rounded-xl flex items-center justify-between cursor-pointer transition active:scale-98">
                <div>
                    <h4 class="font-bold text-xs text-white">${escapeHtml(s.name)}</h4>
                    <p class="text-[11px] text-slate-400">${courseCount} Mata Kuliah • ${totalSks} SKS</p>
                </div>
                <div class="flex items-center space-x-2">
                    ${pendingTasks > 0 ? `<span class="bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-bold">${pendingTasks} Tugas</span>` : '<span class="text-slate-500 text-[10px]">0 Tugas</span>'}
                    <i class="fa-solid fa-chevron-right text-xs text-slate-500"></i>
                </div>
            </div>
        `;
    }).join('');
}

// --- TAB 2: SEMESTERS & COURSES ---
async function loadSemestersTab() {
    await loadSemestersData();
    renderSemesterTabsNav();
    if (!selectedSemesterId && globalSemesters.length > 0) {
        const activeSem = globalSemesters.find(s => s.status === 'Aktif') || globalSemesters[0];
        selectedSemesterId = activeSem.id;
    }
    await loadCoursesForSelectedSemester();
}

function renderSemesterTabsNav() {
    const container = document.getElementById('semesterTabsNav');
    if (!globalSemesters || globalSemesters.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-500 p-2">Belum ada semester.</div>`;
        return;
    }

    container.innerHTML = globalSemesters.map(s => `
        <button onclick="selectSemesterTab(${s.id})" class="px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition border shrink-0 ${selectedSemesterId === s.id ? 'bg-blue-600 text-white border-blue-500 shadow' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}">
            ${escapeHtml(s.name)}
            ${s.status === 'Aktif' ? '<span class="ml-1 text-[9px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded">Aktif</span>' : ''}
        </button>
    `).join('');
}

async function selectSemesterTab(semId) {
    selectedSemesterId = semId;
    switchTab('semesters');
    renderSemesterTabsNav();
    await loadCoursesForSelectedSemester();
}

async function loadCoursesForSelectedSemester() {
    const container = document.getElementById('coursesContainer');
    if (!selectedSemesterId) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Pilih semester terlebih dahulu.</div>`;
        return;
    }

    try {
        const res = await fetch(`/api/courses?semester_id=${selectedSemesterId}`);
        const data = await res.json();
        if (data.status === 'success') {
            globalCourses = data.data || [];
            renderCoursesGrid(globalCourses);
        }
    } catch (err) {
        console.error("Gagal memuat mata kuliah:", err);
    }
}

function renderCoursesGrid(courses) {
    const container = document.getElementById('coursesContainer');
    if (!courses || courses.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center text-slate-400 space-y-3">
                <i class="fa-solid fa-folder-open text-3xl text-slate-500"></i>
                <p class="text-xs sm:text-sm">Belum ada mata kuliah untuk semester ini.</p>
                <button onclick="openModalAddCourse()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded-xl font-bold">
                    + Tambah Mata Kuliah
                </button>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            ${courses.map(c => {
                const fileCount = c.file_count || 0;
                const pendingCount = c.pending_assignments || 0;

                return `
                    <div class="bg-slate-800 border border-slate-700/90 rounded-2xl p-4 space-y-3 relative shadow-md">
                        <div class="flex items-start justify-between">
                            <div>
                                <div class="text-[11px] text-blue-400 font-bold tracking-wide">${escapeHtml(c.code || 'MK')} • ${c.sks || 3} SKS</div>
                                <h3 class="text-sm sm:text-base font-bold text-white mt-0.5">${escapeHtml(c.name)}</h3>
                            </div>
                            <button onclick="deleteCourse(${c.id})" class="text-slate-500 hover:text-rose-400 p-1.5 text-xs" title="Hapus MK">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>

                        <div class="space-y-1 text-xs text-slate-300 border-t border-b border-slate-700/60 py-2">
                            <div class="flex items-center space-x-2">
                                <i class="fa-solid fa-user-tie text-slate-400 w-4"></i>
                                <span class="truncate">Dosen: <strong>${escapeHtml(c.dosen || 'Belum diisi')}</strong></span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <i class="fa-solid fa-calendar-day text-slate-400 w-4"></i>
                                <span class="truncate">Jadwal: <strong>${escapeHtml(c.schedule || '-')}</strong></span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <i class="fa-solid fa-location-dot text-slate-400 w-4"></i>
                                <span class="truncate">Ruang: <strong>${escapeHtml(c.room || '-')}</strong></span>
                            </div>
                        </div>

                        ${c.notes ? `<p class="text-[11px] text-slate-400 italic">" ${escapeHtml(c.notes)} "</p>` : ''}

                        <div class="flex items-center justify-between pt-1 text-xs">
                            <span class="text-slate-400 text-[11px]">
                                <i class="fa-solid fa-paperclip text-amber-400 mr-1"></i> ${fileCount} Berkas • ${pendingCount} Tugas
                            </span>
                            <div class="flex items-center space-x-1.5">
                                <button onclick="openModalUploadFileForCourse(${c.id})" class="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs flex items-center space-x-1">
                                    <i class="fa-solid fa-upload"></i>
                                    <span>Upload</span>
                                </button>
                                <button onclick="filterFilesByCourse(${c.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold">
                                    Lihat Berkas
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function deleteCourse(courseId) {
    if (!confirm("Apakah Anda yakin ingin menghapus mata kuliah ini beserta seluruh tugas dan berkasnya?")) return;
    try {
        const res = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            await loadCoursesForSelectedSemester();
            await loadDashboardSummary();
        }
    } catch (err) {
        alert("Gagal menghapus mata kuliah.");
    }
}

// --- TAB 3: ASSIGNMENTS LOGIC ---
async function loadAssignmentsTab() {
    const statusFilter = document.getElementById('filterAssignmentStatus').value;
    const url = `/api/assignments${statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'success') {
            renderAssignmentsList(data.data || []);
        }
    } catch (err) {
        console.error("Gagal memuat tugas:", err);
    }
}

function renderAssignmentsList(assignments) {
    const container = document.getElementById('assignmentsList');
    if (!assignments || assignments.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center text-slate-400">
                <i class="fa-solid fa-clipboard-check text-3xl text-emerald-500 mb-2 block"></i>
                <p class="text-xs sm:text-sm">Tidak ada tugas yang terdaftar (Kosong).</p>
            </div>`;
        return;
    }

    container.innerHTML = assignments.map(a => {
        const countdown = getDeadlineCountdown(a.deadline);
        let badgeClass = "badge-normal";
        if (a.status === 'Selesai') badgeClass = "bg-emerald-900/40 text-emerald-300 border-emerald-600";
        else if (countdown.isOverdue) badgeClass = "bg-rose-900/50 border-rose-600 text-rose-300";
        else if (countdown.hoursLeft <= 24) badgeClass = "badge-urgent animate-pulse";
        else if (countdown.hoursLeft <= 72) badgeClass = "badge-warning";

        return `
            <div class="bg-slate-800 border border-slate-700/90 rounded-2xl p-4 space-y-3 shadow-md">
                <div class="space-y-1.5">
                    <div class="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span class="text-xs font-bold text-blue-400">${escapeHtml(a.course_name)} (${escapeHtml(a.semester_name)})</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold ${a.priority === 'Tinggi' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-700 text-slate-300'}">${a.priority}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold ${a.status === 'Selesai' ? 'bg-emerald-500/20 text-emerald-300' : (a.status === 'Proses' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300')}">${a.status}</span>
                    </div>
                    <h3 class="font-bold text-white text-sm sm:text-base">${escapeHtml(a.title)}</h3>
                    ${a.description ? `<p class="text-xs text-slate-300">${escapeHtml(a.description)}</p>` : ''}
                    <div class="text-[11px] sm:text-xs text-slate-400 flex items-center space-x-2">
                        <i class="fa-regular fa-clock text-slate-500"></i>
                        <span>Deadline: <strong>${formatDateTime(a.deadline)}</strong></span>
                    </div>

                    ${a.files && a.files.length > 0 ? `
                        <div class="flex flex-wrap gap-1.5 pt-1">
                            ${a.files.map(f => `
                                <button onclick="openFilePreview(${f.id}, '${escapeJs(f.original_name)}', '${f.file_type}', ${f.file_size})" class="text-[10px] sm:text-[11px] bg-slate-900 hover:bg-slate-700 text-blue-300 border border-slate-700 px-2 py-1 rounded-lg flex items-center space-x-1">
                                    <i class="fa-solid fa-paperclip text-amber-400"></i>
                                    <span class="truncate max-w-[130px] sm:max-w-[180px]">${escapeHtml(f.original_name)}</span>
                                </button>
                            `).join('')}
                        </div>
                    ` : '<div class="text-[11px] text-slate-500 italic pt-0.5"><i class="fa-solid fa-paperclip mr-1 text-slate-600"></i>Belum ada berkas terlampir</div>'}
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/60">
                    <div class="text-[11px] font-bold px-2.5 py-1 rounded-lg border ${badgeClass}">
                        ${countdown.text}
                    </div>

                    <div class="flex items-center space-x-1.5">
                        <select onchange="toggleTaskStatus(${a.id}, this.value)" class="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-xl p-1.5 focus:outline-none">
                            <option value="Belum" ${a.status === 'Belum' ? 'selected' : ''}>Belum</option>
                            <option value="Proses" ${a.status === 'Proses' ? 'selected' : ''}>Proses</option>
                            <option value="Selesai" ${a.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                        </select>

                        <button onclick="openModalUploadFileForTask(${a.id}, ${a.course_id})" title="Lampirkan File" class="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs">
                            <i class="fa-solid fa-paperclip"></i>
                        </button>

                        <button onclick="deleteAssignment(${a.id})" title="Hapus Tugas" class="p-2 bg-slate-700 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 rounded-xl text-xs">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleTaskStatus(taskId, newStatus) {
    try {
        const res = await fetch(`/api/assignments/${taskId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.status === 'success') {
            await loadDashboardSummary();
            if (currentActiveTab === 'assignments') loadAssignmentsTab();
        }
    } catch (err) {
        alert("Gagal mengubah status tugas.");
    }
}

async function deleteAssignment(taskId) {
    if (!confirm("Apakah Anda yakin ingin menghapus tugas ini?")) return;
    try {
        const res = await fetch(`/api/assignments/${taskId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            await loadAssignmentsTab();
            await loadDashboardSummary();
        }
    } catch (err) {
        alert("Gagal menghapus tugas.");
    }
}

// --- TAB 4: FILES & IN-BROWSER PREVIEW ---
async function loadFilesTab() {
    const category = document.getElementById('filterFileCategory').value;
    const url = `/api/files${category ? '?category=' + encodeURIComponent(category) : ''}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'success') {
            const files = data.data || [];
            renderFilesTable(files);
            renderFilesMobileList(files);
        }
    } catch (err) {
        console.error("Gagal memuat berkas:", err);
    }
}

function filterFilesByCourse(courseId) {
    switchTab('files');
    fetch(`/api/files?course_id=${courseId}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const files = data.data || [];
                renderFilesTable(files);
                renderFilesMobileList(files);
            }
        });
}

function renderFilesMobileList(files) {
    const mobileContainer = document.getElementById('filesMobileList');
    if (!mobileContainer) return;

    if (!files || files.length === 0) {
        mobileContainer.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                <i class="fa-solid fa-folder-open text-3xl mb-2 block text-slate-600"></i>
                Belum ada berkas tersimpan (0 Berkas).
            </div>`;
        return;
    }

    const categoryLabels = {
        'kontrak': '<span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded font-semibold">Kontrak Kuliah</span>',
        'tugas': '<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] rounded font-semibold">Tugas</span>',
        'materi': '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded font-semibold">Materi</span>',
        'catatan': '<span class="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] rounded font-semibold">Catatan</span>',
        'lainnya': '<span class="px-2 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded font-semibold">Lainnya</span>'
    };

    mobileContainer.innerHTML = files.map(f => {
        const iconClass = getFileIconClass(f.original_name, f.file_type);
        return `
            <div class="p-3 bg-slate-900/60 border border-slate-700/80 rounded-xl space-y-2">
                <div class="flex items-start justify-between">
                    <div class="flex items-center space-x-2 overflow-hidden mr-2">
                        <i class="${iconClass} text-lg text-blue-400 shrink-0"></i>
                        <span class="font-bold text-white text-xs truncate">${escapeHtml(f.original_name)}</span>
                    </div>
                    ${categoryLabels[f.category] || ''}
                </div>
                <div class="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>${escapeHtml(f.course_name || 'Umum')} • ${formatFileSize(f.file_size)}</span>
                    <span>${formatDate(f.uploaded_at)}</span>
                </div>
                <div class="flex items-center justify-end space-x-2 pt-1 border-t border-slate-800">
                    <button onclick="openFilePreview(${f.id}, '${escapeJs(f.original_name)}', '${f.file_type}', ${f.file_size})" class="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow">
                        <i class="fa-solid fa-eye mr-1"></i> Preview
                    </button>
                    <a href="/api/files/download/${f.id}" download class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg">
                        <i class="fa-solid fa-download"></i>
                    </a>
                    <button onclick="deleteFile(${f.id})" class="text-slate-500 hover:text-rose-400 p-1.5 text-xs">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderFilesTable(files) {
    const tbody = document.getElementById('filesTableBody');
    if (!tbody) return;

    if (!files || files.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-500 text-xs">
                    <i class="fa-solid fa-folder-open text-3xl mb-2 block text-slate-600"></i>
                    Belum ada berkas tersimpan (0 Berkas).
                </td>
            </tr>`;
        return;
    }

    const categoryLabels = {
        'kontrak': '<span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[11px] rounded font-semibold">Kontrak Kuliah</span>',
        'tugas': '<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] rounded font-semibold">Tugas</span>',
        'materi': '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[11px] rounded font-semibold">Materi / Slide</span>',
        'catatan': '<span class="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[11px] rounded font-semibold">Catatan</span>',
        'lainnya': '<span class="px-2 py-0.5 bg-slate-700 text-slate-300 text-[11px] rounded font-semibold">Lainnya</span>'
    };

    tbody.innerHTML = files.map(f => {
        const iconClass = getFileIconClass(f.original_name, f.file_type);

        return `
            <tr class="hover:bg-slate-700/40 transition">
                <td class="p-3 font-semibold text-white flex items-center space-x-3">
                    <i class="${iconClass} text-lg text-blue-400"></i>
                    <span class="truncate max-w-xs" title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</span>
                </td>
                <td class="p-3">${categoryLabels[f.category] || f.category}</td>
                <td class="p-3 text-xs text-slate-300">${escapeHtml(f.course_name || '-')}</td>
                <td class="p-3 text-xs text-slate-400">${formatFileSize(f.file_size)}</td>
                <td class="p-3 text-xs text-slate-400">${formatDate(f.uploaded_at)}</td>
                <td class="p-3 text-right space-x-2">
                    <button onclick="openFilePreview(${f.id}, '${escapeJs(f.original_name)}', '${f.file_type}', ${f.file_size})" class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition shadow">
                        <i class="fa-solid fa-eye mr-1"></i> Preview
                    </button>
                    <a href="/api/files/download/${f.id}" download class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg inline-block transition">
                        <i class="fa-solid fa-download"></i>
                    </a>
                    <button onclick="deleteFile(${f.id})" class="text-slate-500 hover:text-rose-400 p-1 text-xs">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteFile(fileId) {
    if (!confirm("Hapus file ini?")) return;
    try {
        const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            loadFilesTab();
        }
    } catch (err) {
        alert("Gagal menghapus file.");
    }
}

// --- FILE PREVIEW ENGINE (PDF, IMAGES, AUDIO, VIDEO, DOCX, TEXT) ---
async function openFilePreview(fileId, originalName, fileType, fileSize) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const meta = document.getElementById('previewMeta');
    const downloadBtn = document.getElementById('previewDownloadBtn');
    const body = document.getElementById('previewBody');
    const icon = document.getElementById('previewIcon');

    title.innerText = originalName;
    meta.innerText = `${formatFileSize(fileSize)} • ${fileType || 'File'}`;
    downloadBtn.href = `/api/files/download/${fileId}`;
    icon.innerHTML = `<i class="${getFileIconClass(originalName, fileType)}"></i>`;

    const previewUrl = `/api/files/preview/${fileId}`;
    const ext = originalName.split('.').pop().toLowerCase();

    body.innerHTML = `<div class="text-slate-400 text-xs flex items-center space-x-2"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-base"></i> <span>Memuat pratinjau...</span></div>`;
    modal.classList.remove('hidden');

    try {
        if (ext === 'pdf' || fileType.includes('pdf')) {
            body.innerHTML = `
                <iframe src="${previewUrl}" class="w-full h-full rounded-none md:rounded-lg border-0 bg-white" title="Pratinjau PDF"></iframe>
            `;
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || fileType.startsWith('image/')) {
            body.innerHTML = `
                <div class="max-w-full max-h-full flex items-center justify-center p-1">
                    <img src="${previewUrl}" alt="${escapeHtml(originalName)}" class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-lg border border-slate-700">
                </div>
            `;
        } else if (['mp4', 'webm', 'ogg'].includes(ext) || fileType.startsWith('video/')) {
            body.innerHTML = `
                <div class="w-full max-w-3xl flex items-center justify-center">
                    <video controls autoplay class="w-full max-h-[75vh] rounded-lg shadow-lg">
                        <source src="${previewUrl}" type="${fileType}">
                        Browser Anda tidak mendukung pemutaran video.
                    </video>
                </div>
            `;
        } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext) || fileType.startsWith('audio/')) {
            body.innerHTML = `
                <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 flex flex-col items-center space-y-4 max-w-sm w-full shadow-lg">
                    <i class="fa-solid fa-music text-4xl text-blue-400 animate-bounce"></i>
                    <div class="text-center">
                        <h4 class="font-bold text-white text-xs sm:text-sm truncate max-w-[250px]">${escapeHtml(originalName)}</h4>
                        <p class="text-[11px] text-slate-400">Putar audio langsung</p>
                    </div>
                    <audio controls autoplay class="w-full">
                        <source src="${previewUrl}" type="${fileType}">
                    </audio>
                </div>
            `;
        } else if (['docx', 'doc'].includes(ext)) {
            try {
                const response = await fetch(previewUrl);
                const arrayBuffer = await response.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                body.innerHTML = `
                    <div class="w-full h-full max-w-4xl bg-white text-slate-900 p-4 sm:p-8 overflow-auto rounded-lg shadow font-serif text-xs sm:text-sm leading-relaxed">
                        ${result.value || '<p class="text-slate-500 italic">Dokumen kosong atau format tidak mendukung ekstraksi HTML penuh.</p>'}
                    </div>
                `;
            } catch (docErr) {
                body.innerHTML = `
                    <div class="text-center p-6 space-y-4 text-slate-300">
                        <i class="fa-solid fa-file-word text-4xl text-blue-400"></i>
                        <p class="text-xs">Gagal mengekstraksi teks Word secara langsung.</p>
                        <a href="${previewUrl}" download class="inline-block bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold">
                            Unduh Dokumen
                        </a>
                    </div>
                `;
            }
        } else if (['txt', 'js', 'py', 'json', 'html', 'css', 'sql', 'md', 'c', 'cpp', 'java'].includes(ext) || fileType.startsWith('text/')) {
            const res = await fetch(previewUrl);
            const textContent = await res.text();
            body.innerHTML = `
                <div class="w-full h-full max-w-4xl bg-slate-900 text-emerald-400 font-mono text-[11px] sm:text-xs p-4 sm:p-6 overflow-auto rounded-lg border border-slate-700 whitespace-pre-wrap">
                    ${escapeHtml(textContent)}
                </div>
            `;
        } else {
            body.innerHTML = `
                <div class="text-center p-6 space-y-4 text-slate-300">
                    <i class="${getFileIconClass(originalName, fileType)} text-5xl text-slate-500"></i>
                    <div>
                        <h4 class="font-bold text-white text-sm">${escapeHtml(originalName)}</h4>
                        <p class="text-xs text-slate-400 mt-1">Pratinjau langsung tidak tersedia untuk format file ini.</p>
                    </div>
                    <a href="${previewUrl}" download class="inline-block bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold">
                        <i class="fa-solid fa-download mr-1"></i> Unduh File (${formatFileSize(fileSize)})
                    </a>
                </div>
            `;
        }
    } catch (e) {
        body.innerHTML = `<div class="text-rose-400 text-xs">Gagal memuat pratinjau file.</div>`;
    }
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.add('hidden');
    document.getElementById('previewBody').innerHTML = '';
}

// --- MODAL & FORM HANDLERS ---
function openModalAddSemester() {
    document.getElementById('modalAddSemester').classList.remove('hidden');
}
function closeModalAddSemester() {
    document.getElementById('modalAddSemester').classList.add('hidden');
}

async function handleAddSemester(e) {
    e.preventDefault();
    const name = document.getElementById('semNameInput').value;
    const academic_year = document.getElementById('semYearInput').value;
    const status = document.getElementById('semStatusInput').value;

    try {
        const res = await fetch('/api/semesters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, academic_year, status })
        });
        const data = await res.json();
        if (data.status === 'success') {
            closeModalAddSemester();
            await loadSemestersData();
            await loadDashboardSummary();
            if (currentActiveTab === 'semesters') loadSemestersTab();
        }
    } catch (err) {
        alert("Gagal menambahkan semester.");
    }
}

function openModalAddCourse() {
    populateSemesterDropdowns();
    if (selectedSemesterId) {
        document.getElementById('courseSemesterSelect').value = selectedSemesterId;
    }
    document.getElementById('modalAddCourse').classList.remove('hidden');
}
function closeModalAddCourse() {
    document.getElementById('modalAddCourse').classList.add('hidden');
}

async function handleAddCourse(e) {
    e.preventDefault();
    const semester_id = document.getElementById('courseSemesterSelect').value;
    const code = document.getElementById('courseCodeInput').value;
    const name = document.getElementById('courseNameInput').value;
    const sks = document.getElementById('courseSksInput').value;
    const dosen = document.getElementById('courseDosenInput').value;
    const schedule = document.getElementById('courseScheduleInput').value;
    const room = document.getElementById('courseRoomInput').value;

    try {
        const res = await fetch('/api/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ semester_id, code, name, sks, dosen, schedule, room })
        });
        const data = await res.json();
        if (data.status === 'success') {
            closeModalAddCourse();
            await loadSemestersData();
            await loadDashboardSummary();
            if (currentActiveTab === 'semesters') loadCoursesForSelectedSemester();
        }
    } catch (err) {
        alert("Gagal menambahkan mata kuliah.");
    }
}

async function openModalAddAssignment() {
    const res = await fetch('/api/courses');
    const data = await res.json();
    const taskCourseSelect = document.getElementById('taskCourseSelect');
    if (data.status === 'success' && data.data && data.data.length > 0) {
        taskCourseSelect.innerHTML = data.data.map(c => `
            <option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code || 'MK')})</option>
        `).join('');
    } else {
        taskCourseSelect.innerHTML = '<option value="">-- Belum Ada Mata Kuliah (Tambah MK Dulu) --</option>';
    }
    document.getElementById('modalAddAssignment').classList.remove('hidden');
}
function closeModalAddAssignment() {
    document.getElementById('modalAddAssignment').classList.add('hidden');
}

async function handleAddAssignment(e) {
    e.preventDefault();
    const course_id = document.getElementById('taskCourseSelect').value;
    if (!course_id) {
        alert("Silakan tambah Mata Kuliah terlebih dahulu!");
        return;
    }
    const title = document.getElementById('taskTitleInput').value;
    const description = document.getElementById('taskDescInput').value;
    const deadline = document.getElementById('taskDeadlineInput').value;
    const priority = document.getElementById('taskPrioritySelect').value;

    try {
        const res = await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ course_id, title, description, deadline, priority, status: 'Belum' })
        });
        const data = await res.json();
        if (data.status === 'success') {
            closeModalAddAssignment();
            await loadDashboardSummary();
            if (currentActiveTab === 'assignments') loadAssignmentsTab();
        }
    } catch (err) {
        alert("Gagal menambahkan tugas.");
    }
}

async function openModalUploadFile() {
    const resC = await fetch('/api/courses');
    const dataC = await resC.json();
    const courseSelect = document.getElementById('uploadFileCourse');
    const courses = (dataC.data || []);
    courseSelect.innerHTML = '<option value="">-- Pilih Mata Kuliah (Opsional) --</option>' + 
        courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    const resA = await fetch('/api/assignments');
    const dataA = await resA.json();
    const assignSelect = document.getElementById('uploadFileAssignment');
    const assignments = (dataA.data || []);
    assignSelect.innerHTML = '<option value="">-- Tidak Terikat Tugas (Opsional) --</option>' + 
        assignments.map(a => `<option value="${a.id}">${escapeHtml(a.title)}</option>`).join('');

    document.getElementById('modalUploadFile').classList.remove('hidden');
}

function openModalUploadFileForCourse(courseId) {
    openModalUploadFile().then(() => {
        document.getElementById('uploadFileCourse').value = courseId;
    });
}

function openModalUploadFileForTask(taskId, courseId) {
    openModalUploadFile().then(() => {
        document.getElementById('uploadFileCourse').value = courseId;
        document.getElementById('uploadFileAssignment').value = taskId;
        document.getElementById('uploadFileCategory').value = 'tugas';
    });
}

function closeModalUploadFile() {
    document.getElementById('modalUploadFile').classList.add('hidden');
}

async function handleUploadFile(e) {
    e.preventDefault();
    const fileInput = document.getElementById('uploadFileInput');
    if (!fileInput.files || fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('category', document.getElementById('uploadFileCategory').value);
    formData.append('course_id', document.getElementById('uploadFileCourse').value);
    formData.append('assignment_id', document.getElementById('uploadFileAssignment').value);

    try {
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.status === 'success') {
            closeModalUploadFile();
            if (currentActiveTab === 'files') loadFilesTab();
            if (currentActiveTab === 'semesters') loadCoursesForSelectedSemester();
            if (currentActiveTab === 'assignments') loadAssignmentsTab();
        } else {
            alert(data.message || "Gagal mengunggah file");
        }
    } catch (err) {
        alert("Gagal mengunggah file.");
    }
}

// Reset data helper
async function resetAllData() {
    if (!confirm("Kosongkan semua data tugas, mata kuliah, dan berkas sampel?")) return;
    try {
        const res = await fetch('/api/reset-data', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            alert(data.message);
            await loadSemestersData();
            await loadDashboardSummary();
            switchTab('dashboard');
        }
    } catch (err) {
        alert("Gagal mengosongkan data.");
    }
}

// --- NOTIFICATION & DEADLINE REMINDER UTILS ---
function checkNotificationPermissionStatus() {
    const statusText = document.getElementById('notifStatusText');
    if (!("Notification" in window)) {
        statusText.innerText = "Pengingat";
        return;
    }
    if (Notification.permission === "granted") {
        statusText.innerText = "Aktif 🔔";
    } else if (Notification.permission === "denied") {
        statusText.innerText = "Diblokir";
    }
}

function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("Browser Anda tidak mendukung web notification.");
        return;
    }
    Notification.requestPermission().then(permission => {
        checkNotificationPermissionStatus();
        if (permission === "granted") {
            triggerWebNotification("Pengingat Tugas eCampus", "Notifikasi pengingat deadline berhasil diaktifkan!");
        }
    });
}

function triggerWebNotification(title, bodyText) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: bodyText,
            icon: '/static/favicon.ico'
        });
    }
}

function startDeadlineTimerCheck() {
    setInterval(() => {
        if (currentActiveTab === 'dashboard') loadDashboardSummary();
        if (currentActiveTab === 'assignments') loadAssignmentsTab();
    }, 60000);
}

// --- HELPER UTILITIES ---
function getDeadlineCountdown(deadlineStr) {
    if (!deadlineStr) return { isOverdue: false, hoursLeft: 999, text: '-' };
    const now = new Date();
    const deadline = new Date(deadlineStr.replace(' ', 'T'));
    const diffMs = deadline - now;

    if (diffMs <= 0) {
        return { isOverdue: true, hoursLeft: 0, text: 'LEWAT DEADLINE' };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;

    if (diffDays > 0) {
        return { isOverdue: false, hoursLeft: diffHours, text: `Sisa ${diffDays}h ${remainingHours}j` };
    } else {
        return { isOverdue: false, hoursLeft: diffHours, text: `⏰ Sisa ${diffHours}j!` };
    }
}

function getFileIconClass(filename, mimeType) {
    if (!filename) return 'fa-solid fa-file text-slate-400';
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'fa-solid fa-file-pdf text-rose-400';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-solid fa-file-image text-emerald-400';
    if (['docx', 'doc'].includes(ext)) return 'fa-solid fa-file-word text-blue-400';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'fa-solid fa-file-excel text-emerald-500';
    if (['pptx', 'ppt'].includes(ext)) return 'fa-solid fa-file-powerpoint text-amber-500';
    if (['mp4', 'webm', 'avi', 'mkv'].includes(ext)) return 'fa-solid fa-file-video text-purple-400';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'fa-solid fa-file-audio text-indigo-400';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-solid fa-file-zipper text-yellow-500';
    if (['txt', 'py', 'js', 'json', 'html', 'css', 'sql', 'md'].includes(ext)) return 'fa-solid fa-file-code text-cyan-400';
    return 'fa-solid fa-file text-slate-400';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
