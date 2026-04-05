import sqlite3
import numpy as np


class FaceDatabase:
	def __init__(self, connection):
		self.conn = connection
		self.create_tables()

	def create_tables(self):

		cursor = self.conn.cursor()

		cursor.execute("""
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
		""")

		cursor.execute("""
		CREATE TABLE IF NOT EXISTS face_embeddings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			embedding BLOB,
			FOREIGN KEY(user_id) REFERENCES users(id)
		)
		""")

		cursor.execute("""
		CREATE TABLE IF NOT EXISTS attendance (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			date TEXT,
			time TEXT,
			FOREIGN KEY(user_id) REFERENCES users(id)
		)
		""")

		self.conn.commit()

	def add_user(self, name):

		cursor = self.conn.cursor()

		cursor.execute(
			"INSERT INTO users (name) VALUES (?)",
			(name,)
		)

		self.conn.commit()

		return cursor.lastrowid

	def add_embedding(self, user_id, embedding):

		embedding_blob = embedding.astype(np.float32).tobytes()

		cursor = self.conn.cursor()

		cursor.execute(
			"INSERT INTO face_embeddings (user_id, embedding) VALUES (?, ?)",
			(user_id, embedding_blob)
		)

		self.conn.commit()

	def get_all_embeddings(self):

		cursor = self.conn.cursor()

		cursor.execute("""
		SELECT users.name, face_embeddings.embedding
		FROM face_embeddings
		JOIN users ON users.id = face_embeddings.user_id
		""")

		rows = cursor.fetchall()

		embeddings = {}

		for row in rows:

			name = row["name"]
			embedding = np.frombuffer(row["embedding"], dtype=np.float32)

			if name not in embeddings:
				embeddings[name] = []

			embeddings[name].append(embedding)

		return embeddings

	def get_all_embeddings_by_user_id(self) -> dict:
		"""
		Returns embeddings keyed by user_id so the scan endpoint can mark
		attendance by ID without ambiguity from duplicate names.

		Shape: { user_id: {"name": str, "embeddings": [np.ndarray]} }
		Silently skips corrupt blobs rather than crashing.
		"""
		cursor = self.conn.cursor()
		cursor.execute("""
			SELECT users.id AS user_id, users.name, face_embeddings.embedding
			FROM face_embeddings
			JOIN users ON users.id = face_embeddings.user_id
		""")
		rows = cursor.fetchall()

		result: dict = {}
		for row in rows:
			uid = row["user_id"]
			try:
				embedding = np.frombuffer(row["embedding"], dtype=np.float32).copy()
				if embedding.size == 0:
					continue
			except Exception:
				continue

			if uid not in result:
				result[uid] = {"name": row["name"], "embeddings": []}
			result[uid]["embeddings"].append(embedding)

		return result

	def get_user_id(self, name):

		cursor = self.conn.cursor()

		cursor.execute(
			"SELECT id FROM users WHERE name = ?",
			(name,)
		)

		row = cursor.fetchone()

		if row:
			return row["id"]

		return None
