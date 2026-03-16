import os

os.environ["QT_QPA_PLATFORM"] = "xcb"

import cv2


class CameraStream:
	def __init__(self, camera_index=2):
		self.camera_index = camera_index
		self.cap = None

	def start(self):
		"""Initialize the webcam."""
		self.cap = cv2.VideoCapture(self.camera_index)

		if not self.cap.isOpened():
			raise RuntimeError(f"Unable to open camera at index {self.camera_index}")

		# Optional settings for smoother capture.
		self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
		self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
		self.cap.set(cv2.CAP_PROP_FPS, 30)

	def read_frame(self):
		"""Read a single frame from the camera."""
		ret, frame = self.cap.read()

		if not ret:
			raise RuntimeError("Failed to read frame from camera")

		return frame

	def release(self):
		"""Release camera resources."""
		if self.cap:
			self.cap.release()
		cv2.destroyAllWindows()
