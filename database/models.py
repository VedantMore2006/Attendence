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
