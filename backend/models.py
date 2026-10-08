from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship
from database import Base

project_members = Table(
    "project_members", Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)

    name = Column(String(200), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)

    role = Column(String(50), default="employee")
    title = Column(String(200), default="")
    department = Column(String(200), default="")

    phone = Column(String(50), default="")
    joining_date = Column(String(30), default="")

    active = Column(Boolean, default=True)
    photo = Column(Text, default="")

    projects = relationship(
        "Project",
        secondary=project_members,
        back_populates="members"
    )

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="Active", nullable=False)
    start_date = Column(String(30), default="")
    due_date = Column(String(30), default="")
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    completed_at = Column(String(50), default="")
    completed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    completed_by_name = Column(String(200), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    members = relationship("User", secondary=project_members, back_populates="projects")
    member_snapshots = relationship("ProjectMemberSnapshot", back_populates="project", cascade="all, delete-orphan")
    owner_user = relationship("User", foreign_keys=[owner_id])
    completed_by_user = relationship("User", foreign_keys=[completed_by_id])

class ProjectMemberSnapshot(Base):
    __tablename__ = "project_member_snapshots"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_public_id = Column(String(80), default="")
    name = Column(String(200), default="")
    email = Column(String(255), default="")
    photo = Column(Text, default="")
    project = relationship("Project", back_populates="member_snapshots")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"))
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="Pending")
    priority = Column(String(50), default="Medium")
    due_date = Column(String(30), default="")
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, default=datetime.utcnow)
    assignee_user = relationship("User", foreign_keys=[assignee_id])

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    employee_name = Column(String(200), default="")
    employee_email = Column(String(255), default="")
    date = Column(String(30), nullable=False)
    done = Column(Text, default="")
    blockers = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", foreign_keys=[user_id])

class Leave(Base):
    __tablename__ = "leaves"
    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    employee_name = Column(String(200), default="")
    employee_email = Column(String(255), default="")
    type = Column(String(100), default="")
    from_date = Column(String(30), default="")
    to_date = Column(String(30), default="")
    reason = Column(Text, default="")
    status = Column(String(50), default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", foreign_keys=[user_id])

class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True)
    public_id = Column(String(80), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, default="")
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name = Column(String(200), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = relationship("User", foreign_keys=[created_by_id])
