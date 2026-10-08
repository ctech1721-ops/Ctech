from typing import List, Optional
from pydantic import BaseModel, Field

class LoginIn(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    name: str
    email: str
    password: str = "welcome123"
    role: str = "employee"
    title: str = ""
    department: str = ""
    phone: str = ""
    joiningDate: str = ""
    active: bool = True
    photo: str = ""

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    joiningDate: Optional[str] = None
    active: Optional[bool] = None
    photo: Optional[str] = None

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    status: str = "Active"
    startDate: str = ""
    dueDate: str = ""
    owner: str = ""
    members: List[str] = Field(default_factory=list)

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    startDate: Optional[str] = None
    dueDate: Optional[str] = None
    owner: Optional[str] = None
    members: Optional[List[str]] = None

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    project: str = ""
    projectId: str = ""
    status: str = "Pending"
    priority: str = "Medium"
    dueDate: str = ""
    assignee: str = ""
    assigneeId: str = ""
    employeeId: str = ""

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project: Optional[str] = None
    projectId: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    dueDate: Optional[str] = None
    assignee: Optional[str] = None
    assigneeId: Optional[str] = None
    employeeId: Optional[str] = None

class ReportCreate(BaseModel):
    user: str = ""
    employeeName: str = ""
    employeeEmail: str = ""
    date: str
    done: str = ""
    blockers: str = ""

class ReportUpdate(BaseModel):
    date: Optional[str] = None
    done: Optional[str] = None
    blockers: Optional[str] = None

class LeaveCreate(BaseModel):
    user: str = ""
    employeeName: str = ""
    employeeEmail: str = ""
    type: str = ""
    from_: str = Field("", alias="from")
    to: str = ""
    reason: str = ""

class LeaveUpdate(BaseModel):
    type: Optional[str] = None
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None
    reason: Optional[str] = None
    status: Optional[str] = None

class AnnouncementCreate(BaseModel):
    title: str
    message: str = ""

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
