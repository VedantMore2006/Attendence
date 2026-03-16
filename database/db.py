import sqlite3
from pathlib import Path


class Database:
	def __init__(self, db_path="attendance.db"):
		self.db_path = db_path
		self.conn = None

	def connect(self):
		self.conn = sqlite3.connect(self.db_path)
		self.conn.row_factory = sqlite3.Row
		return self.conn

	def close(self):
		if self.conn:
			self.conn.close()
