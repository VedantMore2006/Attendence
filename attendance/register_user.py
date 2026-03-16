import time

import cv2


class UserRegistrar:

    def __init__(self, camera, detector, aligner, embedder, db):
        self.camera = camera
        self.detector = detector
        self.aligner = aligner
        self.embedder = embedder
        self.db = db

    def register(self, name, max_embeddings=10, capture_time=30):

        print(f"\nRegistering user: {name}")
        print("Look at the camera and move slightly.\n")

        user_id = self.db.add_user(name)

        # 3-second countdown so user can get into position.
        for i in range(3, 0, -1):
            frame = self.camera.read_frame()
            cv2.putText(
                frame,
                f"Starting in {i}...",
                (30, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.8,
                (0, 255, 255),
                3,
            )
            cv2.imshow("Registration", frame)
            cv2.waitKey(1)
            time.sleep(1)

        print("Go!\n")

        start_time = time.time()
        embeddings_captured = 0

        while True:

            frame = self.camera.read_frame()

            boxes = self.detector.detect_faces(frame)

            for box in boxes:

                face = self.aligner.align_face(frame, box)

                if face is None:
                    continue

                embedding = self.embedder.get_embedding(face)

                if embedding is None:
                    continue

                if embeddings_captured < max_embeddings:

                    self.db.add_embedding(user_id, embedding)

                    embeddings_captured += 1

                    print(f"Captured {embeddings_captured}/{max_embeddings}")

                    time.sleep(0.2)

            cv2.imshow("Registration", frame)

            if embeddings_captured >= max_embeddings:
                break

            if time.time() - start_time > capture_time:
                break

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        cv2.destroyWindow("Registration")
        print("Registration complete.\n")
