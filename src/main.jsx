import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

const YEAR_NAME = '2026 / 2027';
const SEMESTER_NAMES = ['الفصل الأول', 'الفصل الثاني'];

const nav = [
  ['home', '🏠', 'لوحة التحكم'],
  ['classes', '🏫', 'الصفوف والشعب'],
  ['students', '👨‍🎓', 'الطلاب والأسرة الصفية'],
  ['plans', '📝', 'الخطط والتحضير'],
  ['attendance', '✅', 'الحضور والغياب'],
  ['lab', '🔬', 'المختبر والأنشطة'],
  ['exams', '🧪', 'الامتحانات وبنك الأسئلة'],
  ['files', '📁', 'المكتبة والملفات'],
  ['meetings', '🤝', 'الاجتماعات والنادي العلمي'],
  ['reports', '📊', 'التقارير']
];

const today = () => new Date().toISOString().slice(0, 10);
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

async function ensureYearSemester(userId, semesterName = 'الفصل الأول') {
  let { data: year, error } = await supabase
    .from('academic_years')
    .select('id')
    .eq('teacher_id', userId)
    .eq('name', YEAR_NAME)
    .maybeSingle();
  if (error) throw error;
  if (!year) {
    ({ data: year, error } = await supabase
      .from('academic_years')
      .insert({ teacher_id: userId, name: YEAR_NAME, is_current: true })
      .select('id')
      .single());
    if (error) throw error;
  }

  let { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('teacher_id', userId)
    .eq('academic_year_id', year.id)
    .eq('name', semesterName)
    .maybeSingle();

  if (!semester) {
    const result = await supabase
      .from('semesters')
      .insert({
        teacher_id: userId,
        academic_year_id: year.id,
        name: semesterName,
        is_current: semesterName === 'الفصل الأول'
      })
      .select('id')
      .single();
    if (result.error) throw result.error;
    semester = result.data;
  }
  return { yearId: year.id, semesterId: semester.id };
}

async function ensureSubject(userId, name) {
  const subjectName = clean(name);
  if (!subjectName) return null;
  let { data, error } = await supabase
    .from('subjects')
    .select('id')
    .eq('teacher_id', userId)
    .eq('name', subjectName)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    ({ data, error } = await supabase
      .from('subjects')
      .insert({ teacher_id: userId, name: subjectName })
      .select('id')
      .single());
    if (error) throw error;
  }
  return data.id;
}

function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('home');
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setBusy(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadAll(session.user);
  }, [session]);

  async function loadAll(user) {
    try {
      const [{ data: p }, { data: gs }, { data: st }, { data: sub }] = await Promise.all([
        supabase.from('teacher_profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('grades').select('id,name,sort_order,sections(id,name,room)').eq('teacher_id', user.id).order('sort_order').order('name'),
        supabase.from('enrollments').select('id,student_id,section_id,students(id,full_name,student_number,guardian_name,guardian_phone),sections(name,grades(name))').eq('teacher_id', user.id).order('created_at'),
        supabase.from('subjects').select('id,name').eq('teacher_id', user.id).order('name')
      ]);
      setProfile(p);
      setGrades(gs || []);
      setStudents(st || []);
      setSubjects(sub || []);
    } catch (e) {
      setMsg(e.message);
    }
  }

  if (busy) return <div className="center">جارٍ تشغيل المنصة…</div>;
  if (!session) return <Login />;

  const reload = () => loadAll(session.user);

  return (
    <div>
      <header>
        <div className="brand">
          <b>م</b>
          <div><strong>منصة المعلم التعليمية</strong><small>إدارة أعمال المعلم في مكان واحد</small></div>
        </div>
        <div className="userBar">
          <span>{profile?.full_name || session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>خروج</button>
        </div>
      </header>

      <div className="shell">
        <aside>
          {nav.map(([id, icon, label]) => (
            <button className={page === id ? 'active' : ''} onClick={() => setPage(id)} key={id}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </aside>

        <main>
          {msg && <div className="msg">{msg}<button onClick={() => setMsg('')}>×</button></div>}
          {page === 'home' && <Home grades={grades} students={students} subjects={subjects} setPage={setPage} />}
          {page === 'classes' && <Classes grades={grades} reload={reload} setMsg={setMsg} />}
          {page === 'students' && <Students students={students} reload={reload} setMsg={setMsg} />}
          {page === 'plans' && <Plans grades={grades} subjects={subjects} reload={reload} setMsg={setMsg} />}
          {page === 'attendance' && <Attendance grades={grades} subjects={subjects} setMsg={setMsg} />}
          {!['home', 'classes', 'students', 'plans', 'attendance'].includes(page) && <Placeholder page={page} />}
        </main>
      </div>
    </div>
  );
}

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function googleLogin() {
    setLoading(true);
    setError('');
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (e) setError(e.message);
    setLoading(false);
  }

  return (
    <div className="login">
      <div className="loginCard">
        <div className="logo">م</div>
        <h1>منصة المعلم التعليمية</h1>
        <p>دخول موحد بحساب Google. سجلاتك مرتبطة بحسابك فقط.</p>
        <button className="google" disabled={loading} onClick={googleLogin}>
          🌐 {loading ? 'جارٍ الاتصال…' : 'الدخول بحساب Google'}
        </button>
        {error && <div className="msg">{error}</div>}
        <small>يجب تفعيل Google من Authentication → Providers في مشروع Supabase.</small>
      </div>
    </div>
  );
}

function Home({ grades, students, subjects, setPage }) {
  const sections = grades.reduce((n, g) => n + (g.sections?.length || 0), 0);
  return <>
    <div className="hero">
      <h1>مرحبًا بك 👋</h1>
      <p>الهيكل المشترك: العام الدراسي ← الفصل ← الصف ← الشعبة ← الطلاب ← المادة ← السجل.</p>
    </div>
    <div className="stats">
      <div><small>الصفوف</small><b>{grades.length}</b></div>
      <div><small>الشعب</small><b>{sections}</b></div>
      <div><small>تسجيلات الطلاب</small><b>{students.length}</b></div>
      <div><small>المباحث</small><b>{subjects.length}</b></div>
    </div>
    <div className="card">
      <h2>البداية الصحيحة</h2>
      <div className="quick">
        <button onClick={() => setPage('classes')}>🏫<strong>إدارة الصفوف والشعب</strong><small>أنشئ الصف ثم أ، ب، ج، د…</small></button>
        <button onClick={() => setPage('students')}>📥<strong>استيراد الطلاب</strong><small>Excel/CSV لعدة صفوف وشعب دفعة واحدة</small></button>
        <button onClick={() => setPage('plans')}>📝<strong>الخطط والتحضير</strong><small>مرتبطة بالصف والشعبة والمبحث</small></button>
        <button onClick={() => setPage('attendance')}>✅<strong>الحضور</strong><small>سجل يومي حسب الشعبة والمبحث</small></button>
      </div>
    </div>
  </>;
}

function Classes({ grades, reload, setMsg }) {
  async function addGrade() {
    const name = prompt('اسم الصف، مثل: الصف الخامس الأساسي');
    if (!clean(name)) return;
    const u = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('grades').insert({ teacher_id: u.id, name: clean(name), sort_order: grades.length });
    if (error) setMsg(error.message); else reload();
  }

  async function addSection(g, def = 'أ') {
    const name = prompt('اسم الشعبة', def);
    if (!clean(name)) return;
    const u = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('sections').insert({ teacher_id: u.id, grade_id: g.id, name: clean(name) });
    if (error) setMsg(error.message); else reload();
  }

  async function renameGrade(g) {
    const name = prompt('اسم الصف الجديد', g.name);
    if (!clean(name)) return;
    const { error } = await supabase.from('grades').update({ name: clean(name) }).eq('id', g.id);
    if (error) setMsg(error.message); else reload();
  }

  return <>
    <div className="head">
      <div><h1>الصفوف والشعب</h1><p>هذه هي البنية الأساسية التي ستحتوي الطلاب وبقية أعمالك.</p></div>
      <button className="primary" onClick={addGrade}>+ إضافة صف</button>
    </div>
    <div className="hint"><b>مثال:</b> الصف الخامس الأساسي ← أ، ب، ج، د. ويمكن إضافة شعب أكثر عند الحاجة.</div>
    {!grades.length ? <div className="card empty">لا توجد صفوف بعد. ابدأ بإضافة الصف الخامس الأساسي.</div> :
      grades.map(g => <div className="card" key={g.id}>
        <div className="row">
          <div><h2>{g.name}</h2><small>{g.sections?.length || 0} شعبة</small></div>
          <div className="actions"><button onClick={() => addSection(g)}>+ شعبة</button><button onClick={() => renameGrade(g)}>✏️ تعديل الصف</button></div>
        </div>
        <div className="sections">
          {['أ', 'ب', 'ج', 'د'].map(x => {
            const s = g.sections?.find(v => v.name === x);
            return <div className={s ? 'section' : 'section missing'} key={x}>
              <b>الشعبة {x}</b>{s ? <span>✓ موجودة</span> : <button onClick={() => addSection(g, x)}>+ إنشاء</button>}
            </div>;
          })}
        </div>
      </div>)
    }
  </>;
}

function Students({ students, reload, setMsg }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);

  async function readPreview(f) {
    setFile(f || null);
    if (!f) return setPreview([]);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const rows = wb.SheetNames.flatMap(s => XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: '', raw: false }));
    setPreview(rows.slice(0, 8));
  }

  async function importFile() {
    if (!file) return;
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = wb.SheetNames.flatMap(s => XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: '', raw: false }));
      const u = (await supabase.auth.getUser()).data.user;
      const { yearId, semesterId } = await ensureYearSemester(u.id);
      let created = 0, enrolled = 0, updated = 0;

      const val = (r, keys) => {
        for (const k of keys) {
          const h = Object.keys(r).find(z => clean(z).replaceAll(' ', '').toLowerCase() === k.replaceAll(' ', '').toLowerCase());
          if (h && clean(r[h])) return clean(r[h]);
        }
        return '';
      };

      for (const r of rows) {
        const name = val(r, ['اسم الطالب', 'الطالب', 'اسم', 'name', 'full_name']);
        if (!name) continue;
        const gradeName = val(r, ['الصف', 'المرحلة', 'grade']) || 'غير محدد';
        const sectionName = val(r, ['الشعبة', 'القسم', 'section']) || 'أ';
        const number = val(r, ['الرقم', 'رقم الطالب', 'student_number']);

        let { data: grade } = await supabase.from('grades').select('id').eq('teacher_id', u.id).eq('name', gradeName).maybeSingle();
        if (!grade) grade = (await supabase.from('grades').insert({ teacher_id: u.id, name: gradeName }).select('id').single()).data;

        let { data: section } = await supabase.from('sections').select('id').eq('teacher_id', u.id).eq('grade_id', grade.id).eq('name', sectionName).maybeSingle();
        if (!section) section = (await supabase.from('sections').insert({ teacher_id: u.id, grade_id: grade.id, name: sectionName }).select('id').single()).data;

        let student = null;
        if (number) student = (await supabase.from('students').select('id').eq('teacher_id', u.id).eq('student_number', number).maybeSingle()).data;
        if (!student) student = (await supabase.from('students').select('id').eq('teacher_id', u.id).eq('full_name', name).maybeSingle()).data;

        const payload = {
          teacher_id: u.id,
          student_number: number || null,
          full_name: name,
          guardian_name: val(r, ['اسم ولي الأمر', 'ولي الأمر', 'guardian_name']) || null,
          guardian_phone: val(r, ['رقم الهاتف', 'هاتف ولي الأمر', 'رقم ولي الأمر', 'guardian_phone', 'phone']) || null
        };

        if (student) {
          const { error } = await supabase.from('students').update(payload).eq('id', student.id);
          if (error) throw error;
          updated++;
        } else {
          const { data, error } = await supabase.from('students').insert(payload).select('id').single();
          if (error) throw error;
          student = data;
          created++;
        }

        const { data: existing } = await supabase.from('enrollments').select('id').eq('teacher_id', u.id)
          .eq('academic_year_id', yearId).eq('semester_id', semesterId).eq('student_id', student.id).eq('section_id', section.id).maybeSingle();

        if (!existing) {
          const { error } = await supabase.from('enrollments').insert({
            teacher_id: u.id, academic_year_id: yearId, semester_id: semesterId,
            student_id: student.id, section_id: section.id
          });
          if (error) throw error;
          enrolled++;
        }
      }

      setMsg(`تم الاستيراد: ${created} طلاب جدد، ${updated} محدثون، ${enrolled} تسجيلات جديدة.`);
      await reload();
    } catch (e) {
      setMsg('تعذر الاستيراد: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div className="head">
      <div><h1>الطلاب والأسرة الصفية</h1><p>استيراد جماعي لطلاب عدة صفوف وشعب بدل الإدخال اليدوي.</p></div>
      <label className="primary file">📥 اختيار Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={e => readPreview(e.target.files?.[0])}/></label>
      {file && <button className="primary" disabled={loading} onClick={importFile}>{loading ? 'جارٍ الاستيراد…' : 'استيراد الآن'}</button>}
    </div>
    <div className="hint">الأعمدة المقترحة: اسم الطالب | الرقم | الصف | الشعبة | اسم ولي الأمر | رقم الهاتف.</div>
    {preview.length > 0 && <div className="card table"><h3>معاينة أول 8 سجلات قبل الاستيراد</h3><table><tbody>{preview.map((r, i) => <tr key={i}><td>{Object.values(r).slice(0, 6).join(' | ')}</td></tr>)}</tbody></table></div>}
    <div className="card table"><h2>الطلاب المسجلون</h2><table><thead><tr><th>الطالب</th><th>الرقم</th><th>الصف</th><th>الشعبة</th><th>ولي الأمر</th><th>الهاتف</th></tr></thead>
      <tbody>{students.map(x => <tr key={x.id}><td>{x.students?.full_name}</td><td>{x.students?.student_number || '—'}</td><td>{x.sections?.grades?.name || '—'}</td><td>{x.sections?.name || '—'}</td><td>{x.students?.guardian_name || '—'}</td><td>{x.students?.guardian_phone || '—'}</td></tr>)}</tbody>
    </table>{!students.length && <div className="empty">لا يوجد طلاب بعد.</div>}</div>
  </>;
}

function ContextFields({ grades, subjects, value, onChange, includeSection = true }) {
  const grade = grades.find(g => g.id === value.grade_id);
  return <div className="formGrid">
    <select value={value.grade_id || ''} onChange={e => onChange({ grade_id: e.target.value, section_id: '' })}>
      <option value="">اختر الصف</option>{grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
    {includeSection && <select value={value.section_id || ''} onChange={e => onChange({ section_id: e.target.value })} disabled={!grade}>
      <option value="">اختر الشعبة</option>{(grade?.sections || []).map(s => <option key={s.id} value={s.id}>الشعبة {s.name}</option>)}
    </select>}
    <select value={value.subject_id || ''} onChange={e => onChange({ subject_id: e.target.value })}>
      <option value="">اختر المبحث</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  </div>;
}

function Plans({ grades, subjects, reload, setMsg }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    title: '', plan_type: 'daily', lesson_date: today(), unit_name: '', lesson_topic: '',
    objectives: '', activities: '', assessment: '', homework: '', notes: '',
    grade_id: '', section_id: '', subject_id: '', semester_name: 'الفصل الأول'
  });

  async function load() {
    const u = (await supabase.auth.getUser()).data.user;
    const { data, error } = await supabase.from('lesson_plans')
      .select('*,grades(name),sections(name),subjects(name),semesters(name)')
      .eq('teacher_id', u.id).neq('status', 'archived')
      .order('lesson_date', { ascending: false });
    if (error) setMsg(error.message); else setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    if (!form.grade_id || !form.section_id || !form.subject_id) return setMsg('اختر الصف والشعبة والمبحث قبل حفظ التحضير.');
    const u = (await supabase.auth.getUser()).data.user;
    try {
      const { yearId, semesterId } = await ensureYearSemester(u.id, form.semester_name);
      const { error } = await supabase.from('lesson_plans').insert({
        teacher_id: u.id, academic_year_id: yearId, semester_id: semesterId,
        grade_id: form.grade_id, section_id: form.section_id, subject_id: form.subject_id,
        plan_type: form.plan_type, title: clean(form.title), lesson_date: form.lesson_date || null,
        unit_name: clean(form.unit_name) || null, lesson_topic: clean(form.lesson_topic) || null,
        objectives: form.objectives || null, activities: form.activities || null,
        assessment: form.assessment || null, homework: form.homework || null, notes: form.notes || null
      });
      if (error) throw error;
      setMsg('تم حفظ التحضير وربطه بالصف والشعبة والمبحث.');
      setForm({ ...form, title: '', unit_name: '', lesson_topic: '', objectives: '', activities: '', assessment: '', homework: '', notes: '' });
      await load(); await reload();
    } catch (e) { setMsg(e.message); }
  }

  return <>
    <div className="head"><div><h1>الخطط والتحضير</h1><p>كل تحضير مرتبط الآن بالعام والفصل والصف والشعبة والمبحث.</p></div></div>
    <form className="card formCard" onSubmit={save}>
      <h2>إضافة تحضير</h2>
      <div className="formGrid">
        <select value={form.semester_name} onChange={e => setForm({ ...form, semester_name: e.target.value })}>{SEMESTER_NAMES.map(x => <option key={x}>{x}</option>)}</select>
        <select value={form.plan_type} onChange={e => setForm({ ...form, plan_type: e.target.value })}><option value="daily">تحضير يومي</option><option value="weekly">خطة أسبوعية</option><option value="semester">خطة فصلية</option></select>
        <input type="date" value={form.lesson_date} onChange={e => setForm({ ...form, lesson_date: e.target.value })}/>
      </div>
      <ContextFields grades={grades} subjects={subjects} value={form} onChange={x => setForm({ ...form, ...x })}/>
      <div className="formGrid">
        <input required placeholder="عنوان التحضير" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/>
        <input placeholder="الوحدة" value={form.unit_name} onChange={e => setForm({ ...form, unit_name: e.target.value })}/>
        <input placeholder="موضوع الدرس" value={form.lesson_topic} onChange={e => setForm({ ...form, lesson_topic: e.target.value })}/>
        <input placeholder="الأهداف" value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}/>
        <textarea placeholder="الأنشطة والاستراتيجيات" value={form.activities} onChange={e => setForm({ ...form, activities: e.target.value })}/>
        <textarea placeholder="التقويم" value={form.assessment} onChange={e => setForm({ ...form, assessment: e.target.value })}/>
        <textarea placeholder="الواجب" value={form.homework} onChange={e => setForm({ ...form, homework: e.target.value })}/>
        <textarea placeholder="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/>
      </div>
      <button className="primary" type="submit">💾 حفظ التحضير</button>
    </form>
    <div className="card table"><h2>آخر التحاضير</h2><table><thead><tr><th>الصف/الشعبة</th><th>المبحث</th><th>العنوان</th><th>النوع</th><th>التاريخ</th></tr></thead>
      <tbody>{rows.map(x => <tr key={x.id}><td>{x.grades?.name || '—'} / {x.sections?.name || '—'}</td><td>{x.subjects?.name || '—'}</td><td>{x.title}</td><td>{x.plan_type === 'daily' ? 'يومي' : x.plan_type === 'weekly' ? 'أسبوعي' : 'فصلي'}</td><td>{x.lesson_date || '—'}</td></tr>)}</tbody>
    </table>{!rows.length && <div className="empty">لا توجد تحاضير محفوظة.</div>}</div>
  </>;
}

function Attendance({ grades, subjects, setMsg }) {
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState([]);
  const [status, setStatus] = useState({});
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => grades.find(g => g.id === selectedGrade)?.sections || [], [grades, selectedGrade]);

  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    (async () => {
      const u = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase.from('enrollments')
        .select('student_id,students(id,full_name,student_number)')
        .eq('teacher_id', u.id).eq('section_id', selectedSection);
      if (error) setMsg(error.message);
      else {
        const list = data || [];
        setStudents(list);
        setStatus(Object.fromEntries(list.map(x => [x.student_id, 'present'])));
      }
    })();
  }, [selectedSection]);

  async function save() {
    if (!selectedSection) return setMsg('اختر الشعبة أولًا.');
    setSaving(true);
    try {
      const u = (await supabase.auth.getUser()).data.user;
      const { yearId, semesterId } = await ensureYearSemester(u.id);
      const payload = {
        teacher_id: u.id, academic_year_id: yearId, semester_id: semesterId,
        section_id: selectedSection, subject_id: selectedSubject || null,
        attendance_date: date, status: 'completed'
      };
      const { data: sessionRow, error } = await supabase.from('attendance_sessions')
        .upsert(payload, { onConflict: 'teacher_id,section_id,attendance_date,subject_id' })
        .select('id').single();
      if (error) throw error;

      const records = students.map(x => ({
        teacher_id: u.id, attendance_session_id: sessionRow.id,
        student_id: x.student_id, status: status[x.student_id] || 'present'
      }));
      if (records.length) {
        const { error: recordError } = await supabase.from('attendance_records')
          .upsert(records, { onConflict: 'attendance_session_id,student_id' });
        if (recordError) throw recordError;
      }
      setMsg('تم حفظ حضور الشعبة بنجاح دون إنشاء جلسة مكررة.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="head"><div><h1>الحضور والغياب</h1><p>سجل الحضور حسب العام والفصل والصف والشعبة والمبحث.</p></div></div>
    <div className="card toolbarCard">
      <select value={selectedGrade} onChange={e => { setSelectedGrade(e.target.value); setSelectedSection(''); }}><option value="">اختر الصف</option>{grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} disabled={!selectedGrade}><option value="">اختر الشعبة</option>{sections.map(s => <option key={s.id} value={s.id}>الشعبة {s.name}</option>)}</select>
      <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}><option value="">كل المباحث / بدون مبحث</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
      <button className="primary" onClick={save} disabled={saving || !selectedSection}>{saving ? 'جارٍ الحفظ…' : '💾 حفظ الحضور'}</button>
    </div>
    <div className="card table"><table><thead><tr><th>الطالب</th><th>الرقم</th><th>الحالة</th></tr></thead>
      <tbody>{students.map(x => <tr key={x.student_id}><td>{x.students?.full_name}</td><td>{x.students?.student_number || '—'}</td><td><select value={status[x.student_id] || 'present'} onChange={e => setStatus({ ...status, [x.student_id]: e.target.value })}><option value="present">حاضر</option><option value="absent">غائب</option><option value="late">متأخر</option><option value="excused">معذور</option></select></td></tr>)}</tbody>
    </table>{!students.length && <div className="empty">اختر شعبة تحتوي على طلاب.</div>}</div>
  </>;
}

function Placeholder({ page }) {
  const m = {
    lab: ['المختبر والأنشطة', 'سجل الأدوات والأنشطة المخبرية والنتائج والمرفقات.'],
    exams: ['الامتحانات وبنك الأسئلة', 'بنك أسئلة، مولد امتحانات، وأنشطة إلكترونية.'],
    files: ['المكتبة والملفات', 'كتب، أوراق عمل، نماذج ومرفقات قابلة للأرشفة والبحث.'],
    meetings: ['الاجتماعات والنادي العلمي', 'محاضر اجتماعات لجنة المبحث وأنشطة النادي العلمي.'],
    reports: ['التقارير', 'تقارير الطلاب والحضور والتحضير والأنشطة والامتحانات.']
  };
  const [title, desc] = m[page] || ['الوحدة', 'هذه الوحدة قيد البناء ضمن نفس الهيكل العام للمنصة.'];
  return <><div className="head"><div><h1>{title}</h1><p>{desc}</p></div></div><div className="card empty">تم تجهيز مكان الوحدة، وستُبنى على نفس سياق العام ← الفصل ← الصف ← الشعبة ← الطلاب.</div></>;
}

createRoot(document.getElementById('root')).render(<App />);
