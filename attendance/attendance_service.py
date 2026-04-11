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

	def get_today_record(self, user_id):
		"""Return today's attendance row for user_id, or None."""
		today = datetime.now().date().isoformat()
		cursor = self.conn.cursor()
		cursor.execute(
			"SELECT * FROM attendance WHERE user_id = ? AND date = ?",
			(user_id, today)
		)
		return cursor.fetchone()

	def mark_checkout(self, user_id) -> str | None:
		"""
		Record the checkout time for a user who has already checked in today
		but has not yet checked out.
		Returns the checkout time string on success, None if not applicable.
		"""
		today = datetime.now().date().isoformat()
		cursor = self.conn.cursor()
		cursor.execute(
			"SELECT id, checkout_time FROM attendance WHERE user_id = ? AND date = ?",
			(user_id, today)
		)
		row = cursor.fetchone()

		if row is None or row["checkout_time"] is not None:
			return None

		checkout_time = datetime.now().time().strftime("%H:%M:%S")
		cursor.execute(
			"UPDATE attendance SET checkout_time = ? WHERE id = ?",
			(checkout_time, row["id"])
		)
		self.conn.commit()
		return checkout_time
