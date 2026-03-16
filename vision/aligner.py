import cv2


class FaceAligner:
	def __init__(self, target_size=(112, 112)):
		self.target_size = target_size

	def align_face(self, frame, bbox):
		"""
		Input:
			frame -> original image
			bbox  -> [x1, y1, x2, y2]

		Output:
			aligned_face (112x112)
		"""

		h, w, _ = frame.shape
		x1, y1, x2, y2 = bbox

		# Safety clamp (important).
		x1 = max(0, x1)
		y1 = max(0, y1)
		x2 = min(w, x2)
		y2 = min(h, y2)

		# Crop face.
		face = frame[y1:y2, x1:x2]

		if face.size == 0:
			return None

		# Resize to ArcFace input size.
		aligned_face = cv2.resize(face, self.target_size)

		return aligned_face
