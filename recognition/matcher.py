import numpy as np


class FaceMatcher:
    def __init__(self, threshold=0.55):
        self.threshold = threshold

        # name -> list of embeddings
        self.known_embeddings = {}

    def add_embedding(self, name, embedding):
        """
        Add a new embedding for a user.
        """
        if name not in self.known_embeddings:
            self.known_embeddings[name] = []

        self.known_embeddings[name].append(embedding)

    def cosine_similarity(self, emb1, emb2):
        emb1 = np.array(emb1)
        emb2 = np.array(emb2)

        return np.dot(emb1, emb2) / (
            np.linalg.norm(emb1) * np.linalg.norm(emb2)
        )

    def match_embedding(self, new_embedding):

        best_user = None
        best_score = -1

        for name, embeddings in self.known_embeddings.items():

            for stored_embedding in embeddings:

                similarity = self.cosine_similarity(
                    new_embedding,
                    stored_embedding
                )

                if similarity > best_score:
                    best_score = similarity
                    best_user = name

        if best_score >= self.threshold:
            return best_user, best_score

        return None, best_score
