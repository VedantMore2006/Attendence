import cv2
import os

os.environ["QT_QPA_PLATFORM"] = "xcb"

cap = cv2.VideoCapture(2)

while True:
    ret, frame = cap.read()

    if not ret:
        print("Camera not detected")
        break

    cv2.imshow("Webcam Test", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()