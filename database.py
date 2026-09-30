import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'ecampus.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Semesters table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS semesters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            academic_year TEXT,
            status TEXT DEFAULT 'Aktif',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Courses (Mata Kuliah) table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            semester_id INTEGER NOT NULL,
            code TEXT,
            name TEXT NOT NULL,
            sks INTEGER DEFAULT 3,
            dosen TEXT,
            schedule TEXT,
            room TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
        )
    ''')

    # Assignments (Tugas) table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            deadline DATETIME NOT NULL,
            priority TEXT DEFAULT 'Sedang', -- 'Tinggi', 'Sedang', 'Rendah'
            status TEXT DEFAULT 'Belum',    -- 'Belum', 'Proses', 'Selesai'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    ''')

    # Files table (Kontrak Kuliah, Tugas, Materi, DLL)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER,
            assignment_id INTEGER,
            category TEXT NOT NULL, -- 'kontrak', 'tugas', 'materi', 'catatan', 'lainnya'
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        )
    ''')

    # Seed default Semesters 1 to 8 if table is empty
    cursor.execute('SELECT COUNT(*) FROM semesters')
    if cursor.fetchone()[0] == 0:
        default_semesters = [
            ("Semester 1", "2023/2024 Ganjil", "Selesai"),
            ("Semester 2", "2023/2024 Genap", "Selesai"),
            ("Semester 3", "2024/2025 Ganjil", "Selesai"),
            ("Semester 4", "2024/2025 Genap", "Aktif"),
            ("Semester 5", "2025/2026 Ganjil", "Mendatang"),
            ("Semester 6", "2025/2026 Genap", "Mendatang"),
            ("Semester 7", "2026/2027 Ganjil", "Mendatang"),
            ("Semester 8", "2026/2027 Genap", "Mendatang")
        ]
        cursor.executemany('INSERT INTO semesters (name, academic_year, status) VALUES (?, ?, ?)', default_semesters)

        # Seed sample courses & sample assignments for demo
        cursor.execute('SELECT id FROM semesters WHERE name = ?', ('Semester 4',))
        sem4 = cursor.fetchone()
        if sem4:
            sem4_id = sem4['id']
            cursor.execute('''
                INSERT INTO courses (semester_id, code, name, sks, dosen, schedule, room, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sem4_id, "IF401", "Pemrograman Web Lanjut", 3, "Dr. Ir. Budi Santoso, M.T.", "Senin, 08:00 - 10:30", "Lab Komputer 3", "Menggunakan Flask & React"))
            course_id_1 = cursor.lastrowid

            cursor.execute('''
                INSERT INTO courses (semester_id, code, name, sks, dosen, schedule, room, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sem4_id, "IF402", "Basis Data Lanjut", 3, "Prof. Siti Aminah, Ph.D.", "Rabu, 13:00 - 15:30", "Ruang 402", "Materi seputar Query Optimization & NoSQL"))
            course_id_2 = cursor.lastrowid

            # Sample assignments
            cursor.execute('''
                INSERT INTO assignments (course_id, title, description, deadline, priority, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (course_id_1, "Tugas 1: Aplikasi CRUD E-Campus", "Buatlah aplikasi E-Campus yang memiliki fitur manajemen semester, mata kuliah, pengingat tugas, dan preview file.", "2026-10-05 23:59:00", "Tinggi", "Proses"))

            cursor.execute('''
                INSERT INTO assignments (course_id, title, description, deadline, priority, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (course_id_2, "Laporan Praktikum Query Optimization", "Analisis performa indexing pada database SQLite & PostgreSQL dengan dataset 100k baris.", "2026-10-02 17:00:00", "Sedang", "Belum"))

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
