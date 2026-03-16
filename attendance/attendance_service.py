from datetime import datetime


class AttendanceService:

	def __init__(self, connection):
		self.conn = connection

	def has_attended_today(self, user_id):

		today = datetime.now().date().isoformat()

		cursor = self.conn.cursor()

		cursor.execute(
			"""
			SELECT * FROM attendance
			WHERE user_id = ? AND date = ?
			""",
			(user_id, today)
		)

		result = cursor.fetchone()

		return result is not None

	def mark_attendance(self, user_id):

		if self.has_attended_today(user_id):
			return False

		now = datetime.now()

		date = now.date().isoformat()
		time = now.time().strftime("%H:%M:%S")

		cursor = self.conn.cursor()

		cursor.execute(
			"""
			INSERT INTO attendance (user_id, date, time)
			VALUES (?, ?, ?)
			""",
			(user_id, date, time)
		)

		self.conn.commit()

		return True
