# Database Cheat Sheet — attendance.db

---

## Open the database in Python

```python
from database.db import Database
from database.models import FaceDatabase

db = Database()
conn = db.connect()
face_db = FaceDatabase(conn)
```

---

## Register a new user

```python
user_id = face_db.add_user("Vedant")
print("Created user ID:", user_id)
```

---

## Store an embedding for a user

```python
import numpy as np

embedding = np.random.rand(512).astype(np.float32)  # replace with real embedding
face_db.add_embedding(user_id, embedding)
```

---

## Load all embeddings into matcher

```python
from recognition.matcher import FaceMatcher

matcher = FaceMatcher()
matcher.known_embeddings = face_db.get_all_embeddings()

print(matcher.known_embeddings.keys())   # dict_keys(['Vedant', ...])
```

---

## Open the SQLite shell

```bash
sqlite3 /home/vedant/Attendence/attendance.db
```

---

## SQLite shell commands

```sql
-- List all tables
.tables

-- See all users
SELECT * FROM users;

-- See all stored embeddings (IDs only, blob is binary)
SELECT id, user_id FROM face_embeddings;

-- Count embeddings per user
SELECT users.name, COUNT(face_embeddings.id) AS count
FROM face_embeddings
JOIN users ON users.id = face_embeddings.user_id
GROUP BY users.name;

-- Delete a specific user and their embeddings
DELETE FROM face_embeddings WHERE user_id = 1;
DELETE FROM users WHERE id = 1;

-- Wipe all data and start fresh
DELETE FROM face_embeddings;
DELETE FROM users;

-- Exit sqlite3 shell
.quit
```

---

## Quick Python script — print all users

```python
from database.db import Database
from database.models import FaceDatabase

db = Database()
conn = db.connect()
face_db = FaceDatabase(conn)

cursor = conn.cursor()
cursor.execute("SELECT id, name, created_at FROM users")
for row in cursor.fetchall():
    print(dict(row))

db.close()
```

---

## Quick Python script — count embeddings per user

```python
from database.db import Database
from database.models import FaceDatabase

db = Database()
conn = db.connect()
face_db = FaceDatabase(conn)

embeddings = face_db.get_all_embeddings()
for name, embs in embeddings.items():
    print(f"{name}: {len(embs)} embeddings")

db.close()
```

---

## Quick Python script — delete a user by name

```python
from database.db import Database

db = Database()
conn = db.connect()
cursor = conn.cursor()

name = "Vedant"

cursor.execute("SELECT id FROM users WHERE name = ?", (name,))
row = cursor.fetchone()

if row:
    user_id = row["id"]
    cursor.execute("DELETE FROM face_embeddings WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    print(f"Deleted user: {name}")
else:
    print("User not found.")

db.close()
```

---

## Quick Python script — wipe entire database

```python
from database.db import Database

db = Database()
conn = db.connect()
cursor = conn.cursor()

cursor.execute("DELETE FROM face_embeddings")
cursor.execute("DELETE FROM users")
conn.commit()

print("Database wiped.")
db.close()
```

---

## File location

```
/home/vedant/Attendence/attendance.db
```

## Tables

| Table            | Columns                                          |
|------------------|--------------------------------------------------|
| users            | id, name, created_at                             |
| face_embeddings  | id, user_id (FK → users.id), embedding (BLOB)   |

## Embedding format

- 512 float32 values stored as binary BLOB
- Stored with: `embedding.astype(np.float32).tobytes()`
- Read back with: `np.frombuffer(blob, dtype=np.float32)`
