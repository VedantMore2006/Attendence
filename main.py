import os
import time
from collections import defaultdict

os.environ["QT_QPA_PLATFORM"] = "xcb"

import cv2

from attendance.attendance_service import AttendanceService
from attendance.register_user import UserRegistrar
from camera.camera_stream import CameraStream
from database.db import Database
from database.models import FaceDatabase
from recognition.matcher import FaceMatcher
from vision.aligner import FaceAligner
from vision.detector import FaceDetector
from vision.embedder import FaceEmbedder


PERSISTENCE_TIME = 1.0
DETECTION_INTERVAL = 3
CACHE_TIME = 0.5


def main():
    # --- Database setup ---
    database = Database()
    conn = database.connect()
    face_db = FaceDatabase(conn)
    attendance_service = AttendanceService(conn)

    # --- Pipeline components ---
    camera = CameraStream(camera_index=0)
    detector = FaceDetector()
    aligner = FaceAligner()
    embedder = FaceEmbedder()
    matcher = FaceMatcher()

    camera.start()

    # Brief warm-up so the webcam exposure stabilises.
    print("Camera warming up...")
    for _ in range(10):
        camera.read_frame()

    # --- Registration ---
    registrar = UserRegistrar(camera, detector, aligner, embedder, face_db)
    name = input("Enter new user name to register (or press Enter to skip): ").strip()
    if name:
        registrar.register(name)

    # --- Load all DB embeddings into matcher ---
    matcher.known_embeddings = face_db.get_all_embeddings()
    print(f"Loaded {sum(len(v) for v in matcher.known_embeddings.values())} embeddings "
          f"for {len(matcher.known_embeddings)} user(s).\n")

    # --- Runtime stabilizers ---
    face_presence = defaultdict(lambda: {"first_seen": None, "last_seen": None})
    frame_count = 0
    last_name = None
    last_score = -1.0
    last_update = 0.0
    last_label = "Detecting..."
    last_color = (255, 255, 0)

    # --- Recognition loop ---
    while True:
        frame = camera.read_frame()
        frame_count += 1

        boxes = detector.detect_faces(frame)

        if not boxes:
            for record in face_presence.values():
                record["first_seen"] = None
                record["last_seen"] = None
            last_label = "No Face"
            last_color = (0, 0, 255)
            cv2.imshow("Recognition Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        # Keep only the largest face to reduce false positives.
        boxes = sorted(
            boxes,
            key=lambda b: (b[2] - b[0]) * (b[3] - b[1]),
            reverse=True,
        )
        box = boxes[0]

        x1, y1, x2, y2 = box

        # Draw baseline box even on skipped frames.
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 2)

        if frame_count % DETECTION_INTERVAL != 0:
            cv2.putText(
                frame,
                f"{last_label} | Processing...",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                last_color,
                2,
            )
            cv2.imshow("Recognition Test", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        face = aligner.align_face(frame, box)

        if face is None:
            last_label = "Face Not Clear"
            last_color = (0, 165, 255)
            cv2.imshow("Recognition Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        embedding = embedder.get_embedding(face)

        if embedding is None:
            last_label = "Embedding Failed"
            last_color = (0, 165, 255)
            cv2.imshow("Recognition Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        current_time = time.time()
        if current_time - last_update < CACHE_TIME:
            name, score = last_name, last_score
        else:
            name, score = matcher.match_embedding(embedding)
            last_name = name
            last_score = score
            last_update = current_time

        if name:
            # Reset timer if the identity was not continuously visible.
            if (
                face_presence[name]["last_seen"] is not None
                and current_time - face_presence[name]["last_seen"] > 0.5
            ):
                face_presence[name]["first_seen"] = None

            if face_presence[name]["first_seen"] is None:
                face_presence[name]["first_seen"] = current_time

            face_presence[name]["last_seen"] = current_time

            elapsed = current_time - face_presence[name]["first_seen"]

            if elapsed < PERSISTENCE_TIME:
                label = f"{name} (Hold Still {PERSISTENCE_TIME - elapsed:.1f}s)"
                color = (0, 165, 255)
            else:
                user_id = face_db.get_user_id(name)

                if user_id is None:
                    label = f"{name} (User Missing)"
                    color = (0, 165, 255)
                elif attendance_service.has_attended_today(user_id):
                    label = f"{name} (Already Marked)"
                    color = (0, 255, 255)
                else:
                    attendance_service.mark_attendance(user_id)
                    label = f"{name} (Attendance Marked)"
                    color = (0, 255, 0)
        else:
            for record in face_presence.values():
                record["first_seen"] = None
                record["last_seen"] = None
            label = "Unknown"
            color = (0, 0, 255)

        last_label = label
        last_color = color

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            frame,
            label,
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

        cv2.imshow("Recognition Test", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    camera.release()
    database.close()


if __name__ == "__main__":
    main()
