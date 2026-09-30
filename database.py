import sqlite3
import os

# Check if running on Vercel (read-only filesystem, must use /tmp)
if os.environ.get('VERCEL') == '1' or os.environ.get('VERCEL_ENV'):
    DB_PATH = '/tmp/ecampus.db'
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), 'ecampus.db')

def get_db():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)

    needs_init = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    if needs_init:
        _create_schema(conn)
    else:
        # Always sync academic years to ensure Semester 3 (2026/2027 Ganjil) is Aktif
        _adjust_academic_years(conn)

    return conn

def _adjust_academic_years(conn):
    cursor = conn.cursor()
    years_map = {
        "Semester 1": ("2025/2026 Ganjil", "Selesai"),
        "Semester 2": ("2025/2026 Genap", "Selesai"),
        "Semester 3": ("2026/2027 Ganjil", "Aktif"),
        "Semester 4": ("2026/2027 Genap", "Mendatang"),
        "Semester 5": ("2027/2028 Ganjil", "Mendatang"),
        "Semester 6": ("2027/2028 Genap", "Mendatang"),
        "Semester 7": ("2028/2029 Ganjil", "Mendatang"),
        "Semester 8": ("2028/2029 Genap", "Mendatang")
    }
    for sem_name, (acad_year, status) in years_map.items():
        cursor.execute('UPDATE semesters SET academic_year = ?, status = ? WHERE name = ?', (acad_year, status, sem_name))

    # Move sample courses to Semester 3 if needed
    cursor.execute('SELECT id FROM semesters WHERE name = ?', ('Semester 3',))
    sem3 = cursor.fetchone()
    if sem3:
        sem3_id = sem3['id']
        cursor.execute('UPDATE courses SET semester_id = ? WHERE semester_id IN (SELECT id FROM semesters WHERE name = "Semester 4")', (sem3_id,))
    
    conn.commit()

def _create_schema(conn):
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
            priority TEXT DEFAULT 'Sedang',
            status TEXT DEFAULT 'Belum',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    ''')

    # Files table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER,
            assignment_id INTEGER,
            category TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES semesters(id) ON DELETE CASCADE,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        )
    ''')

    # Seed default Semesters 1 to 8 (Semester 3 is current active semester for Sept 2026)
    cursor.execute('SELECT COUNT(*) FROM semesters')
    if cursor.fetchone()[0] == 0:
        default_semesters = [
            ("Semester 1", "2025/2026 Ganjil", "Selesai"),
            ("Semester 2", "2025/2026 Genap", "Selesai"),
            ("Semester 3", "2026/2027 Ganjil", "Aktif"),
            ("Semester 4", "2026/2027 Genap", "Mendatang"),
            ("Semester 5", "2027/2028 Ganjil", "Mendatang"),
            ("Semester 6", "2027/2028 Genap", "Mendatang"),
            ("Semester 7", "2028/2029 Ganjil", "Mendatang"),
            ("Semester 8", "2028/2029 Genap", "Mendatang")
        ]
        cursor.executemany('INSERT INTO semesters (name, academic_year, status) VALUES (?, ?, ?)', default_semesters)

        cursor.execute('SELECT id FROM semesters WHERE name = ?', ('Semester 3',))
        sem3 = cursor.fetchone()
        if sem3:
            sem3_id = sem3['id']
            cursor.execute('''
                INSERT INTO courses (semester_id, code, name, sks, dosen, schedule, room, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sem3_id, "IF301", "Pemrograman Web Lanjut", 3, "Dr. Ir. Budi Santoso, M.T.", "Senin, 08:00 - 10:30", "Lab Komputer 3", "Menggunakan Flask & React"))
            course_id_1 = cursor.lastrowid

            cursor.execute('''
                INSERT INTO courses (semester_id, code, name, sks, dosen, schedule, room, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sem3_id, "IF302", "Basis Data Lanjut", 3, "Prof. Siti Aminah, Ph.D.", "Rabu, 13:00 - 15:30", "Ruang 402", "Materi seputar Query Optimization & NoSQL"))
            course_id_2 = cursor.lastrowid

            cursor.execute('''
                INSERT INTO assignments (course_id, title, description, deadline, priority, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (course_id_1, "Tugas 1: Aplikasi CRUD E-Campus", "Buatlah aplikasi E-Campus yang memiliki fitur manajemen semester, mata kuliah, pengingat tugas, dan preview file.", "2026-10-05 23:59:00", "Tinggi", "Proses"))

            cursor.execute('''
                INSERT INTO assignments (course_id, title, description, deadline, priority, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (course_id_2, "Laporan Praktikum Query Optimization", "Analisis performa indexing pada database SQLite & PostgreSQL dengan dataset 100k baris.", "2026-10-02 17:00:00", "Sedang", "Belum"))

    conn.commit()

def init_db():
    conn = get_db()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database academic years adjusted successfully.")
