from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from models import User, Project, ProjectMemberSnapshot, Task, Report, Leave, Announcement
from schemas import LoginIn, UserCreate, UserUpdate, ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate, ReportCreate, ReportUpdate, LeaveCreate, LeaveUpdate, AnnouncementCreate, AnnouncementUpdate

app = FastAPI(title="CTech Backend API", version="1.0.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

Base.metadata.create_all(bind=engine)
def new_id(prefix): return f"{prefix}_{uuid4().hex[:12]}"
def user_by_id(db, x): return db.query(User).filter(User.public_id == x).first() if x else None
def project_by_id(db, x): return db.query(Project).filter(Project.public_id == x).first() if x else None
def task_by_id(db, x): return db.query(Task).filter(Task.public_id == x).first() if x else None
def report_by_id(db, x): return db.query(Report).filter(Report.public_id == x).first() if x else None
def leave_by_id(db, x): return db.query(Leave).filter(Leave.public_id == x).first() if x else None
def announcement_by_id(db, x): return db.query(Announcement).filter(Announcement.public_id == x).first() if x else None

def user_json(u):
    return {
        "id": u.public_id,
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "title": u.title or "",
        "department": u.department or "",
        "phone": u.phone or "",
        "joiningDate": u.joining_date or "",
        "active": bool(u.active),
        "photo": u.photo or "",
    }

def project_json(p):
    return {"id":p.public_id,"name":p.name,"description":p.description or "","status":p.status,"startDate":p.start_date or "","dueDate":p.due_date or "","owner":p.owner_user.public_id if p.owner_user else "","members":[u.public_id for u in p.members],"completedAt":p.completed_at or "","completedBy":p.completed_by_user.public_id if p.completed_by_user else "","completedByName":p.completed_by_name or "","memberSnapshots":[{"id":s.user_public_id,"name":s.name,"email":s.email,"photo":s.photo or ""} for s in p.member_snapshots]}

def task_json(t, project=None):
    pid = project.public_id if project else ""
    return {"id":t.public_id,"title":t.title,"description":t.description or "","project":pid,"projectId":pid,"status":t.status,"priority":t.priority,"dueDate":t.due_date or "","assignee":t.assignee_user.public_id if t.assignee_user else "","assigneeId":t.assignee_user.public_id if t.assignee_user else "","employeeId":t.assignee_user.public_id if t.assignee_user else ""}

def report_json(r):
    return {"id":r.public_id,"user":r.user.public_id if r.user else "","employeeName":r.employee_name or (r.user.name if r.user else ""),"employeeEmail":r.employee_email or (r.user.email if r.user else ""),"date":r.date,"done":r.done or "","blockers":r.blockers or ""}

def leave_json(l):
    return {"id":l.public_id,"user":l.user.public_id if l.user else "","employeeName":l.employee_name or (l.user.name if l.user else ""),"employeeEmail":l.employee_email or (l.user.email if l.user else ""),"type":l.type or "","from":l.from_date,"to":l.to_date,"reason":l.reason or "","status":l.status}

def announcement_json(a):
    return {"id":a.public_id,"title":a.title,"message":a.message or "","createdBy":a.created_by.public_id if a.created_by else "","createdByName":a.created_by_name or (a.created_by.name if a.created_by else ""),"createdAt":a.created_at.isoformat() if a.created_at else ""}

def ensure_owner(db):
    owner=db.query(User).filter(User.role=="owner").first()
    if owner:
        owner.email="owner@worknest.demo"; owner.password="owner123"; owner.active=True; db.commit(); return
    db.add(User(public_id="owner",name="Owner",email="owner@worknest.demo",password="owner123",role="owner",title="Administrator",department="Management",active=True,photo="")); db.commit()

@app.on_event("startup")
def startup():
    db=next(get_db())
    try: ensure_owner(db)
    finally: db.close()

@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "index.html")
@app.get("/api/health")
def health(): return {"status":"ok"}

@app.post("/api/login")
def login(p: LoginIn, db: Session=Depends(get_db)):
    u=db.query(User).filter(User.email==p.email.strip().lower()).first()
    if not u or u.password!=p.password: raise HTTPException(401,"Invalid email or password")
    if not u.active: raise HTTPException(403,"Account is inactive")
    return {"ok":True,"user":user_json(u)}

@app.get("/api/employees")
def employees(q: str="", db: Session=Depends(get_db)):
    query=db.query(User)
    if q.strip():
        x=f"%{q.strip()}%"; query=query.filter(or_(User.name.ilike(x),User.email.ilike(x),User.department.ilike(x),User.title.ilike(x)))
    return [user_json(u) for u in query.order_by(User.name).all()]

@app.get("/api/employees/{id}")
def employee(id: str, db: Session=Depends(get_db)):
    u=user_by_id(db,id)
    if not u: raise HTTPException(404,"Employee not found")
    return user_json(u)

@app.post("/api/employees")
def create_employee(p: UserCreate, db: Session=Depends(get_db)):
    email=p.email.strip().lower()
    if db.query(User).filter(User.email==email).first(): raise HTTPException(409,"Email already exists")
    u=User(
    public_id=new_id("usr"),
    name=p.name.strip(),
    email=email,
    password=p.password,
    role=p.role,
    title=p.title,
    department=p.department,
    phone=p.phone,
    joining_date=p.joiningDate,
    active=p.active,
    photo=p.photo
)
    db.add(u); db.commit(); db.refresh(u); return user_json(u)

@app.put("/api/employees/{id}")
def update_employee(id: str, p: UserUpdate, db: Session = Depends(get_db)):
    u = user_by_id(db, id)
    if not u:
        raise HTTPException(404, "Employee not found")

    data = p.model_dump(exclude_unset=True)

    if "password" in data and not data["password"]:
        del data["password"]

    if "email" in data:
        email = data["email"].strip().lower()

        if db.query(User).filter(User.email == email, User.id != u.id).first():
            raise HTTPException(409, "Email already exists")

        data["email"] = email

    for k, v in data.items():
        setattr(u, k, v)

    db.commit()
    db.refresh(u)

    return user_json(u)


@app.delete("/api/employees/{id}")
def delete_employee(id: str, db: Session = Depends(get_db)):
    u = user_by_id(db, id)
    if not u:
        raise HTTPException(404, "Employee not found")

    for p in db.query(Project).all():
        if p.status != "Completed":
            p.members = [m for m in p.members if m.id != u.id]
            if p.owner_id == u.id:
                p.owner_id = None

    for t in db.query(Task).filter(Task.assignee_id == u.id).all():
        t.assignee_id = None

    for r in db.query(Report).filter(Report.user_id == u.id).all():
        r.employee_name = u.name
        r.employee_email = u.email
        r.user_id = None

    for l in db.query(Leave).filter(Leave.user_id == u.id).all():
        l.employee_name = u.name
        l.employee_email = u.email
        l.user_id = None

    db.delete(u)
    db.commit()

    return {"ok": True, "message": f"{u.name} deleted successfully"}

@app.get("/api/projects")
def projects(status: Optional[str]=None,db: Session=Depends(get_db)):
    q=db.query(Project).options(joinedload(Project.members),joinedload(Project.member_snapshots),joinedload(Project.owner_user),joinedload(Project.completed_by_user))
    if status: q=q.filter(Project.status==status)
    return [project_json(p) for p in q.order_by(Project.created_at.desc()).all()]

@app.get("/api/projects/{id}")
def project(id: str,db: Session=Depends(get_db)):
    p=project_by_id(db,id)
    if not p: raise HTTPException(404,"Project not found")
    return project_json(p)

@app.post("/api/projects")
def create_project(p: ProjectCreate,db: Session=Depends(get_db)):
    owner=user_by_id(db,p.owner); members=[user_by_id(db,x) for x in p.members]; members=[x for x in members if x]
    obj=Project(public_id=new_id("prj"),name=p.name,description=p.description,status=p.status,start_date=p.startDate,due_date=p.dueDate,owner_id=owner.id if owner else None,members=members)
    db.add(obj); db.commit(); db.refresh(obj); return project_json(obj)

@app.put("/api/projects/{id}")
def update_project(id: str,p: ProjectUpdate,db: Session=Depends(get_db)):
    obj=project_by_id(db,id)
    if not obj: raise HTTPException(404,"Project not found")
    old=obj.status; data=p.model_dump(exclude_unset=True)
    for key,attr in [("name","name"),("description","description"),("startDate","start_date"),("dueDate","due_date")]:
        if key in data: setattr(obj,attr,data[key])
    if "owner" in data:
        u=user_by_id(db,data["owner"]); obj.owner_id=u.id if u else None
    if "members" in data and data["members"] is not None:
        obj.members=[user_by_id(db,x) for x in data["members"] if user_by_id(db,x)]
    if "status" in data: obj.status=data["status"]
    if old!="Completed" and obj.status=="Completed":
        obj.completed_at=datetime.utcnow().isoformat(timespec="seconds")
        obj.member_snapshots.clear()
        for u in obj.members: obj.member_snapshots.append(ProjectMemberSnapshot(user_public_id=u.public_id,name=u.name,email=u.email,photo=u.photo or ""))
    db.commit(); db.refresh(obj); return project_json(obj)

@app.delete("/api/projects/{id}")
def delete_project(id: str,db: Session=Depends(get_db)):
    p=project_by_id(db,id)
    if not p: raise HTTPException(404,"Project not found")
    db.delete(p); db.commit(); return {"ok":True,"message":"Project deleted successfully"}

@app.post("/api/projects/{id}/complete")
def complete_project(id: str,completed_by: str="",db: Session=Depends(get_db)):
    p=project_by_id(db,id)
    if not p: raise HTTPException(404,"Project not found")
    u=user_by_id(db,completed_by); p.status="Completed"; p.completed_at=datetime.utcnow().isoformat(timespec="seconds"); p.completed_by_id=u.id if u else None; p.completed_by_name=u.name if u else ""; p.member_snapshots.clear()
    for m in p.members: p.member_snapshots.append(ProjectMemberSnapshot(user_public_id=m.public_id,name=m.name,email=m.email,photo=m.photo or ""))
    db.commit(); db.refresh(p); return project_json(p)

@app.post("/api/projects/{id}/reopen")
def reopen_project(id: str,db: Session=Depends(get_db)):
    p=project_by_id(db,id)
    if not p: raise HTTPException(404,"Project not found")
    p.status="Active"; p.completed_at=""; db.commit(); db.refresh(p); return project_json(p)

@app.get("/api/tasks")
def tasks(user: Optional[str]=None,project: Optional[str]=None,db: Session=Depends(get_db)):
    q=db.query(Task).options(joinedload(Task.assignee_user)).order_by(Task.created_at.desc())
    if user:
        u=user_by_id(db,user)
        if u: q=q.filter(Task.assignee_id==u.id)
    if project:
        p=project_by_id(db,project)
        if p: q=q.filter(Task.project_id==p.id)
    rows=q.all(); ps={p.id:p for p in db.query(Project).all()}; return [task_json(t,ps.get(t.project_id)) for t in rows]

@app.get("/api/tasks/{id}")
def task(id: str,db: Session=Depends(get_db)):
    t=task_by_id(db,id)
    if not t: raise HTTPException(404,"Task not found")
    p=db.query(Project).filter(Project.id==t.project_id).first() if t.project_id else None; return task_json(t,p)

@app.post("/api/tasks")
def create_task(p: TaskCreate,db: Session=Depends(get_db)):
    aid=p.assignee or p.assigneeId or p.employeeId; u=user_by_id(db,aid); pid=p.project or p.projectId; pr=project_by_id(db,pid)
    t=Task(public_id=new_id("tsk"),title=p.title,description=p.description,project_id=pr.id if pr else None,status=p.status,priority=p.priority,due_date=p.dueDate,assignee_id=u.id if u else None)
    db.add(t); db.commit(); db.refresh(t); return task_json(t,pr)

@app.put("/api/tasks/{id}")
def update_task(id: str,p: TaskUpdate,db: Session=Depends(get_db)):
    t=task_by_id(db,id)
    if not t: raise HTTPException(404,"Task not found")
    data=p.model_dump(exclude_unset=True)
    for key,attr in [("title","title"),("description","description"),("status","status"),("priority","priority"),("dueDate","due_date")]:
        if key in data: setattr(t,attr,data[key])
    if any(k in data for k in ["assignee","assigneeId","employeeId"]):
        u=user_by_id(db,data.get("assignee") or data.get("assigneeId") or data.get("employeeId")); t.assignee_id=u.id if u else None
    if "project" in data or "projectId" in data:
        pr=project_by_id(db,data.get("project") or data.get("projectId")); t.project_id=pr.id if pr else None
    db.commit(); db.refresh(t); pr=db.query(Project).filter(Project.id==t.project_id).first() if t.project_id else None; return task_json(t,pr)

@app.delete("/api/tasks/{id}")
def delete_task(id: str,db: Session=Depends(get_db)):
    t=task_by_id(db,id)
    if not t: raise HTTPException(404,"Task not found")
    db.delete(t); db.commit(); return {"ok":True,"message":"Task deleted successfully"}

@app.get("/api/reports")
def reports(user: Optional[str]=None,q: str="",db: Session=Depends(get_db)):
    query=db.query(Report).options(joinedload(Report.user)).order_by(Report.date.desc(),Report.created_at.desc())
    if user:
        u=user_by_id(db,user)
        if u: query=query.filter(Report.user_id==u.id)
    rows=query.all()
    if q.strip():
        x=q.lower(); rows=[r for r in rows if x in (r.employee_name or "").lower() or x in (r.employee_email or "").lower() or x in (r.done or "").lower() or x in (r.blockers or "").lower()]
    return [report_json(r) for r in rows]

@app.post("/api/reports")
def create_report(p: ReportCreate,db: Session=Depends(get_db)):
    u=user_by_id(db,p.user); r=Report(public_id=new_id("rpt"),user_id=u.id if u else None,employee_name=p.employeeName or (u.name if u else ""),employee_email=p.employeeEmail or (u.email if u else ""),date=p.date,done=p.done,blockers=p.blockers); db.add(r); db.commit(); db.refresh(r); return report_json(r)

@app.put("/api/reports/{id}")
def update_report(id: str,p: ReportUpdate,db: Session=Depends(get_db)):
    r=report_by_id(db,id)
    if not r: raise HTTPException(404,"Report not found")
    for k,v in p.model_dump(exclude_unset=True).items(): setattr(r,k,v)
    db.commit(); db.refresh(r); return report_json(r)

@app.delete("/api/reports/{id}")
def delete_report(id: str,db: Session=Depends(get_db)):
    r=report_by_id(db,id)
    if not r: raise HTTPException(404,"Report not found")
    db.delete(r); db.commit(); return {"ok":True,"message":"Report deleted successfully"}

@app.post("/api/reports/recover-unassigned")
def recover_reports(employee_id: str,db: Session=Depends(get_db)):
    u=user_by_id(db,employee_id)
    if not u: raise HTTPException(404,"Employee not found")
    n=0
    for r in db.query(Report).filter(Report.user_id.is_(None)).all():
        if not r.employee_name: r.user_id=u.id; r.employee_name=u.name; r.employee_email=u.email; n+=1
    db.commit(); return {"ok":True,"count":n}

@app.get("/api/leaves")
def leaves(user: Optional[str]=None,status: Optional[str]=None,db: Session=Depends(get_db)):
    q=db.query(Leave).options(joinedload(Leave.user)).order_by(Leave.created_at.desc())
    if user:
        u=user_by_id(db,user)
        if u: q=q.filter(Leave.user_id==u.id)
    if status: q=q.filter(Leave.status==status)
    return [leave_json(x) for x in q.all()]

@app.post("/api/leaves")
def create_leave(p: LeaveCreate,db: Session=Depends(get_db)):
    u=user_by_id(db,p.user); l=Leave(public_id=new_id("lev"),user_id=u.id if u else None,employee_name=p.employeeName or (u.name if u else ""),employee_email=p.employeeEmail or (u.email if u else ""),type=p.type,from_date=p.from_,to_date=p.to,reason=p.reason,status="Pending"); db.add(l); db.commit(); db.refresh(l); return leave_json(l)

@app.put("/api/leaves/{id}")
def update_leave(id: str,p: LeaveUpdate,db: Session=Depends(get_db)):
    l=leave_by_id(db,id)
    if not l: raise HTTPException(404,"Leave not found")
    data=p.model_dump(exclude_unset=True,by_alias=True)
    if "from" in data: l.from_date=data["from"]
    for k in ["to","type","reason","status"]:
        if k in data: setattr(l,k if k!="to" else "to_date",data[k])
    db.commit(); db.refresh(l); return leave_json(l)

@app.delete("/api/leaves/{id}")
def delete_leave(id: str,db: Session=Depends(get_db)):
    l=leave_by_id(db,id)
    if not l: raise HTTPException(404,"Leave not found")
    db.delete(l); db.commit(); return {"ok":True,"message":"Leave deleted successfully"}

@app.post("/api/leaves/recover-unassigned")
def recover_leaves(employee_id: str,db: Session=Depends(get_db)):
    u=user_by_id(db,employee_id)
    if not u: raise HTTPException(404,"Employee not found")
    n=0
    for l in db.query(Leave).filter(Leave.user_id.is_(None)).all():
        if not l.employee_name: l.user_id=u.id; l.employee_name=u.name; l.employee_email=u.email; n+=1
    db.commit(); return {"ok":True,"count":n}

@app.get("/api/announcements")
def announcements(db: Session=Depends(get_db)):
    return [announcement_json(a) for a in db.query(Announcement).options(joinedload(Announcement.created_by)).order_by(Announcement.created_at.desc()).all()]

@app.post("/api/announcements")
def create_announcement(p: AnnouncementCreate,created_by: str="",db: Session=Depends(get_db)):
    u=user_by_id(db,created_by); a=Announcement(public_id=new_id("ann"),title=p.title,message=p.message,created_by_id=u.id if u else None,created_by_name=u.name if u else ""); db.add(a); db.commit(); db.refresh(a); return announcement_json(a)

@app.put("/api/announcements/{id}")
def update_announcement(id: str,p: AnnouncementUpdate,db: Session=Depends(get_db)):
    a=announcement_by_id(db,id)
    if not a: raise HTTPException(404,"Announcement not found")
    for k,v in p.model_dump(exclude_unset=True).items(): setattr(a,k,v)
    db.commit(); db.refresh(a); return announcement_json(a)

@app.delete("/api/announcements/{id}")
def delete_announcement(id: str,db: Session=Depends(get_db)):
    a=announcement_by_id(db,id)
    if not a: raise HTTPException(404,"Announcement not found")
    db.delete(a); db.commit(); return {"ok":True,"message":"Announcement deleted successfully"}

@app.get("/api/profile/{id}")
def profile(id: str,db: Session=Depends(get_db)):
    u=user_by_id(db,id)
    if not u: raise HTTPException(404,"Profile not found")
    return user_json(u)

@app.put("/api/profile/{id}")
def update_profile(id: str,p: UserUpdate,db: Session=Depends(get_db)):
    u=user_by_id(db,id)
    if not u: raise HTTPException(404,"Profile not found")
    for k,v in p.model_dump(exclude_unset=True).items():
        if k in ["name","email","password","title","department","photo"]: setattr(u,k,v)
    db.commit(); db.refresh(u); return user_json(u)

@app.get("/api/dashboard")
def dashboard(db: Session=Depends(get_db)):
    return {"employees":db.query(User).filter(User.role=="employee").count(),"activeEmployees":db.query(User).filter(User.role=="employee",User.active==True).count(),"projects":db.query(Project).filter(Project.status!="Completed").count(),"completedProjects":db.query(Project).filter(Project.status=="Completed").count(),"tasks":db.query(Task).count(),"pendingTasks":db.query(Task).filter(Task.status!="Completed").count(),"reports":db.query(Report).count(),"pendingLeaves":db.query(Leave).filter(Leave.status=="Pending").count(),"announcements":db.query(Announcement).count()}
# existing code above...
