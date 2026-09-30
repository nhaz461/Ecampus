import os
import uuid
import mimetypes
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from database import get_db, init_db

app = Flask(__name__)

# Determine Upload Folder (Use /tmp on Vercel)
if os.environ.get('VERCEL') == '1' or os.environ.get('VERCEL_ENV'):
    UPLOAD_FOLDER = '/tmp/uploads'
else:
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload size

# --- Page Routes ---
@app.route('/')
def index():
    return render_template('index.html')

# --- API: Semesters ---
@app.route('/api/semesters', methods=['GET'])
def get_semesters():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM semesters ORDER BY id ASC')
    semesters = [dict(row) for row in cursor.fetchall()]
    
    for sem in semesters:
        cursor.execute('SELECT COUNT(*) as course_count, COALESCE(SUM(sks), 0) as total_sks FROM courses WHERE semester_id = ?', (sem['id'],))
        stats = cursor.fetchone()
        sem['course_count'] = stats['course_count'] if stats['course_count'] else 0
        sem['total_sks'] = stats['total_sks'] if stats['total_sks'] else 0

        cursor.execute('''
            SELECT COUNT(*) as pending_tasks FROM assignments a
            JOIN courses c ON a.course_id = c.id
            WHERE c.semester_id = ? AND a.status != 'Selesai'
        ''', (sem['id'],))
        sem['pending_tasks'] = cursor.fetchone()['pending_tasks']
        
    conn.close()
    return jsonify({'status': 'success', 'data': semesters})

@app.route('/api/semesters', methods=['POST'])
def add_semester():
    data = request.json
    name = data.get('name')
    academic_year = data.get('academic_year', '')
    status = data.get('status', 'Mendatang')

    if not name:
        return jsonify({'status': 'error', 'message': 'Nama Semester wajib diisi'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO semesters (name, academic_year, status) VALUES (?, ?, ?)', (name, academic_year, status))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'status': 'success', 'id': new_id, 'message': 'Semester berhasil ditambahkan'})

@app.route('/api/semesters/<int:sem_id>', methods=['DELETE'])
def delete_semester(sem_id):
    conn = get_db()
    conn.execute('DELETE FROM semesters WHERE id = ?', (sem_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Semester berhasil dihapus'})

# --- API: Courses (Mata Kuliah) ---
@app.route('/api/courses', methods=['GET'])
def get_courses():
    semester_id = request.args.get('semester_id')
    conn = get_db()
    cursor = conn.cursor()
    
    if semester_id:
        cursor.execute('SELECT * FROM courses WHERE semester_id = ? ORDER BY id ASC', (semester_id,))
    else:
        cursor.execute('SELECT * FROM courses ORDER BY semester_id ASC, id ASC')
        
    courses = [dict(row) for row in cursor.fetchall()]
    
    for c in courses:
        cursor.execute('SELECT COUNT(*) as count FROM assignments WHERE course_id = ? AND status != "Selesai"', (c['id'],))
        c['pending_assignments'] = cursor.fetchone()['count']
        
        # Count files attached to this course directly OR through assignments of this course
        cursor.execute('''
            SELECT COUNT(*) as count FROM files 
            WHERE course_id = ? OR assignment_id IN (SELECT id FROM assignments WHERE course_id = ?)
        ''', (c['id'], c['id']))
        c['file_count'] = cursor.fetchone()['count']
        
    conn.close()
    return jsonify({'status': 'success', 'data': courses})

@app.route('/api/courses', methods=['POST'])
def add_course():
    data = request.json
    semester_id = data.get('semester_id')
    name = data.get('name')
    code = data.get('code', '')
    sks = data.get('sks', 3)
    dosen = data.get('dosen', '')
    schedule = data.get('schedule', '')
    room = data.get('room', '')
    notes = data.get('notes', '')

    if not semester_id or not name:
        return jsonify({'status': 'error', 'message': 'Semester dan Nama Mata Kuliah wajib diisi'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO courses (semester_id, code, name, sks, dosen, schedule, room, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (semester_id, code, name, sks, dosen, schedule, room, notes))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'status': 'success', 'id': new_id, 'message': 'Mata Kuliah berhasil ditambahkan'})

@app.route('/api/courses/<int:course_id>', methods=['PUT'])
def update_course(course_id):
    data = request.json
    conn = get_db()
    conn.execute('''
        UPDATE courses SET code=?, name=?, sks=?, dosen=?, schedule=?, room=?, notes=?
        WHERE id=?
    ''', (data.get('code'), data.get('name'), data.get('sks'), data.get('dosen'), 
          data.get('schedule'), data.get('room'), data.get('notes'), course_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Mata Kuliah berhasil diperbarui'})

@app.route('/api/courses/<int:course_id>', methods=['DELETE'])
def delete_course(course_id):
    conn = get_db()
    conn.execute('DELETE FROM courses WHERE id = ?', (course_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Mata Kuliah berhasil dihapus'})

# --- API: Assignments (Tugas & Pengingat) ---
@app.route('/api/assignments', methods=['GET'])
def get_assignments():
    course_id = request.args.get('course_id')
    semester_id = request.args.get('semester_id')
    status = request.args.get('status')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT a.*, c.name as course_name, c.code as course_code, s.name as semester_name
        FROM assignments a
        JOIN courses c ON a.course_id = c.id
        JOIN semesters s ON c.semester_id = s.id
        WHERE 1=1
    '''
    params = []
    
    if course_id:
        query += ' AND a.course_id = ?'
        params.append(course_id)
    if semester_id:
        query += ' AND c.semester_id = ?'
        params.append(semester_id)
    if status:
        query += ' AND a.status = ?'
        params.append(status)
        
    query += ' ORDER BY a.status ASC, a.deadline ASC'
    
    cursor.execute(query, params)
    assignments = [dict(row) for row in cursor.fetchall()]
    
    for task in assignments:
        cursor.execute('SELECT * FROM files WHERE assignment_id = ?', (task['id'],))
        task['files'] = [dict(f) for f in cursor.fetchall()]
        
    conn.close()
    return jsonify({'status': 'success', 'data': assignments})

@app.route('/api/assignments', methods=['POST'])
def add_assignment():
    data = request.json
    course_id = data.get('course_id')
    title = data.get('title')
    description = data.get('description', '')
    deadline = data.get('deadline')
    priority = data.get('priority', 'Sedang')
    status = data.get('status', 'Belum')

    if not course_id or not title or not deadline:
        return jsonify({'status': 'error', 'message': 'Mata Kuliah, Judul Tugas, dan Deadline wajib diisi'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO assignments (course_id, title, description, deadline, priority, status)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (course_id, title, description, deadline, priority, status))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'status': 'success', 'id': new_id, 'message': 'Tugas berhasil ditambahkan'})

@app.route('/api/assignments/<int:task_id>', methods=['PUT'])
def update_assignment(task_id):
    data = request.json
    conn = get_db()
    conn.execute('''
        UPDATE assignments SET title=?, description=?, deadline=?, priority=?, status=?
        WHERE id=?
    ''', (data.get('title'), data.get('description'), data.get('deadline'),
          data.get('priority'), data.get('status'), task_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Tugas berhasil diperbarui'})

@app.route('/api/assignments/<int:task_id>/status', methods=['PATCH'])
def update_assignment_status(task_id):
    data = request.json
    new_status = data.get('status')
    if new_status not in ['Belum', 'Proses', 'Selesai']:
        return jsonify({'status': 'error', 'message': 'Status tidak valid'}), 400

    conn = get_db()
    conn.execute('UPDATE assignments SET status = ? WHERE id = ?', (new_status, task_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Status tugas diperbarui'})

@app.route('/api/assignments/<int:task_id>', methods=['DELETE'])
def delete_assignment(task_id):
    conn = get_db()
    conn.execute('DELETE FROM assignments WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Tugas berhasil dihapus'})

# --- API: Files (Storage & Preview) ---
@app.route('/api/files', methods=['GET'])
def get_files():
    course_id = request.args.get('course_id')
    category = request.args.get('category')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT f.*, c.name as course_name, s.name as semester_name, a.title as assignment_title
        FROM files f
        LEFT JOIN courses c ON f.course_id = c.id
        LEFT JOIN semesters s ON c.semester_id = s.id
        LEFT JOIN assignments a ON f.assignment_id = a.id
        WHERE 1=1
    '''
    params = []
    
    if course_id:
        query += ' AND (f.course_id = ? OR f.assignment_id IN (SELECT id FROM assignments WHERE course_id = ?))'
        params.append(course_id)
        params.append(course_id)
    if category:
        query += ' AND f.category = ?'
        params.append(category)
        
    query += ' ORDER BY f.id DESC'
    cursor.execute(query, params)
    files = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({'status': 'success', 'data': files})

@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Tidak ada file yang diunggah'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Nama file kosong'}), 400

    course_id = request.form.get('course_id')
    assignment_id = request.form.get('assignment_id')
    category = request.form.get('category', 'lainnya')

    original_name = secure_filename(file.filename)
    if not original_name:
        original_name = file.filename

    ext = os.path.splitext(original_name)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    saved_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    
    file.save(saved_path)
    file_size = os.path.getsize(saved_path)
    file_type = mimetypes.guess_type(original_name)[0] or 'application/octet-stream'

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO files (course_id, assignment_id, category, filename, original_name, file_path, file_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (course_id if course_id else None, assignment_id if assignment_id else None,
          category, unique_filename, original_name, saved_path, file_type, file_size))
    conn.commit()
    file_id = cursor.lastrowid
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'File berhasil diunggah',
        'data': {
            'id': file_id,
            'original_name': original_name,
            'filename': unique_filename,
            'file_type': file_type,
            'file_size': file_size,
            'category': category
        }
    })

@app.route('/api/files/preview/<int:file_id>', methods=['GET'])
def preview_file(file_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM files WHERE id = ?', (file_id,))
    file_rec = cursor.fetchone()
    conn.close()

    if not file_rec or not os.path.exists(file_rec['file_path']):
        return jsonify({'status': 'error', 'message': 'File tidak ditemukan'}), 404

    mime = file_rec['file_type'] or mimetypes.guess_type(file_rec['original_name'])[0] or 'application/octet-stream'
    return send_file(file_rec['file_path'], mimetype=mime, as_attachment=False, download_name=file_rec['original_name'])

@app.route('/api/files/download/<int:file_id>', methods=['GET'])
def download_file(file_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM files WHERE id = ?', (file_id,))
    file_rec = cursor.fetchone()
    conn.close()

    if not file_rec or not os.path.exists(file_rec['file_path']):
        return jsonify({'status': 'error', 'message': 'File tidak ditemukan'}), 404

    return send_file(file_rec['file_path'], as_attachment=True, download_name=file_rec['original_name'])

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
def delete_file(file_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT file_path FROM files WHERE id = ?', (file_id,))
    file_rec = cursor.fetchone()
    if file_rec:
        if os.path.exists(file_rec['file_path']):
            try:
                os.remove(file_rec['file_path'])
            except Exception as e:
                print(f"Error deleting file: {e}")
        cursor.execute('DELETE FROM files WHERE id = ?', (file_id,))
        conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'File berhasil dihapus'})

# --- API: Reset Demo Data ---
@app.route('/api/reset-data', methods=['POST'])
def reset_data():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM files')
    cursor.execute('DELETE FROM assignments')
    cursor.execute('DELETE FROM courses')
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Seluruh data tugas & berkas berhasil dikosongkan.'})

# --- API: Dashboard Summary & Notifications ---
@app.route('/api/dashboard/summary', methods=['GET'])
def get_dashboard_summary():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) as total_semesters FROM semesters')
    total_semesters = cursor.fetchone()['total_semesters']

    cursor.execute('SELECT COUNT(*) as total_courses, COALESCE(SUM(sks), 0) as total_sks FROM courses')
    course_stats = cursor.fetchone()

    cursor.execute("SELECT COUNT(*) as pending_tasks FROM assignments WHERE status != 'Selesai'")
    pending_tasks = cursor.fetchone()['pending_tasks']

    cursor.execute("SELECT COUNT(*) as urgent_tasks FROM assignments WHERE status != 'Selesai' AND deadline <= datetime('now', '+3 days')")
    urgent_tasks = cursor.fetchone()['urgent_tasks']

    cursor.execute('''
        SELECT a.*, c.name as course_name, s.name as semester_name
        FROM assignments a
        JOIN courses c ON a.course_id = c.id
        JOIN semesters s ON c.semester_id = s.id
        WHERE a.status != 'Selesai'
        ORDER BY a.deadline ASC
        LIMIT 5
    ''')
    upcoming_tasks = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({
        'status': 'success',
        'summary': {
            'total_semesters': total_semesters or 0,
            'total_courses': course_stats['total_courses'] if course_stats['total_courses'] else 0,
            'total_sks': course_stats['total_sks'] if course_stats['total_sks'] else 0,
            'pending_tasks': pending_tasks or 0,
            'urgent_tasks': urgent_tasks or 0
        },
        'upcoming_tasks': upcoming_tasks
    })

if __name__ == '__main__':
    print("Starting eCampus Web Application on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
