import cv2
import mediapipe as mp


class FaceDetector:
	def __init__(self, confidence=0.5):
		self.mp_face_detection = mp.solutions.face_detection
		self.detector = self.mp_face_detection.FaceDetection(
			model_selection=0,
			min_detection_confidence=confidence,
		)

	def detect_faces(self, frame):
		"""
		Input: frame (BGR image from OpenCV)
		Output: list of bounding boxes [x1, y1, x2, y2]
		"""

		h, w, _ = frame.shape

		# Convert BGR -> RGB (MediaPipe requirement)
		rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

		results = self.detector.process(rgb_frame)

		boxes = []

		if results.detections:
			for detection in results.detections:
				bbox = detection.location_data.relative_bounding_box

				x1 = int(bbox.xmin * w)
				y1 = int(bbox.ymin * h)
				width = int(bbox.width * w)
				height = int(bbox.height * h)

				x2 = x1 + width
				y2 = y1 + height

				boxes.append([x1, y1, x2, y2])

		return boxes
