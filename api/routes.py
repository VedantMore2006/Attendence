import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from attendance.attendance_service import AttendanceService
from database.models import FaceDatabase


DB_PATH = "attendance.db"

router = APIRouter(tags=["attendance"])


class CreateUserRequest(BaseModel):
	name: str = Field(min_length=1, max_length=120)


class UserResponse(BaseModel):
	id: int
	name: str
	created_at: str


class MarkAttendanceRequest(BaseModel):
	user_id: int


class AttendanceRecordResponse(BaseModel):
	id: int
	user_id: int
	name: str
	date: str
	time: str


class StatsTodayResponse(BaseModel):
	date: str
	total_users: int
	present_users: int
	attendance_percent: float


def get_connection():
	conn = sqlite3.connect(DB_PATH, check_same_thread=False)
	conn.row_factory = sqlite3.Row
	try:
		yield conn
	finally:
		conn.close()


def init_database() -> None:
	conn = sqlite3.connect(DB_PATH, check_same_thread=False)
	try:
		FaceDatabase(conn)
	finally:
		conn.close()


@router.get("/health")
def health() -> dict:
	return {"status": "ok", "service": "smart-attendance-api"}


@router.post("/users", response_model=UserResponse)
def create_user(payload: CreateUserRequest, conn=Depends(get_connection)):
	face_db = FaceDatabase(conn)
	cleaned_name = payload.name.strip()

	if not cleaned_name:
		raise HTTPException(status_code=400, detail="Name cannot be empty")

	user_id = face_db.add_user(cleaned_name)

	cursor = conn.cursor()
	cursor.execute(
		"SELECT id, name, created_at FROM users WHERE id = ?",
		(user_id,),
	)
	row = cursor.fetchone()

	return UserResponse(
		id=row["id"],
		name=row["name"],
		created_at=row["created_at"],
	)


@router.get("/users", response_model=list[UserResponse])
def list_users(conn=Depends(get_connection)):
	cursor = conn.cursor()
	cursor.execute(
		"""
		SELECT id, name, created_at
		FROM users
		ORDER BY id DESC
		"""
	)
	rows = cursor.fetchall()

	return [
		UserResponse(id=row["id"], name=row["name"], created_at=row["created_at"])
		for row in rows
	]


@router.post("/attendance/mark")
def mark_attendance(payload: MarkAttendanceRequest, conn=Depends(get_connection)):
	cursor = conn.cursor()
	cursor.execute("SELECT id, name FROM users WHERE id = ?", (payload.user_id,))
	user_row = cursor.fetchone()

	if user_row is None:
		raise HTTPException(status_code=404, detail="User not found")

	attendance_service = AttendanceService(conn)
	marked = attendance_service.mark_attendance(payload.user_id)

	if not marked:
		return {
			"status": "already_marked",
			"user_id": payload.user_id,
			"name": user_row["name"],
			"date": datetime.now().date().isoformat(),
		}

	return {
		"status": "marked",
		"user_id": payload.user_id,
		"name": user_row["name"],
		"date": datetime.now().date().isoformat(),
	}


@router.get("/attendance", response_model=list[AttendanceRecordResponse])
def list_attendance(
	date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
	conn=Depends(get_connection),
):
	cursor = conn.cursor()

	if date:
		cursor.execute(
			"""
			SELECT attendance.id, attendance.user_id, users.name, attendance.date, attendance.time
			FROM attendance
			JOIN users ON users.id = attendance.user_id
			WHERE attendance.date = ?
			ORDER BY attendance.date DESC, attendance.time DESC
			""",
			(date,),
		)
	else:
		cursor.execute(
			"""
			SELECT attendance.id, attendance.user_id, users.name, attendance.date, attendance.time
			FROM attendance
			JOIN users ON users.id = attendance.user_id
			ORDER BY attendance.date DESC, attendance.time DESC
			"""
		)

	rows = cursor.fetchall()

	return [
		AttendanceRecordResponse(
			id=row["id"],
			user_id=row["user_id"],
			name=row["name"],
			date=row["date"],
			time=row["time"],
		)
		for row in rows
	]


@router.get("/stats/today", response_model=StatsTodayResponse)
def get_today_stats(conn=Depends(get_connection)):
	today = datetime.now().date().isoformat()
	cursor = conn.cursor()

	cursor.execute("SELECT COUNT(*) AS total_users FROM users")
	total_users = cursor.fetchone()["total_users"]

	cursor.execute(
		"""
		SELECT COUNT(DISTINCT user_id) AS present_users
		FROM attendance
		WHERE date = ?
		""",
		(today,),
	)
	present_users = cursor.fetchone()["present_users"]

	attendance_percent = 0.0
	if total_users > 0:
		attendance_percent = round((present_users / total_users) * 100, 2)

	return StatsTodayResponse(
		date=today,
		total_users=total_users,
		present_users=present_users,
		attendance_percent=attendance_percent,
	)
