import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBFFvYIg-en-T2bGWA7JT9jNtdbapt6GBI",
  authDomain: "mensajeria-app-e49b4.firebaseapp.com",
  projectId: "mensajeria-app-e49b4",
  storageBucket: "mensajeria-app-e49b4.firebasestorage.app",
  messagingSenderId: "102076791930",
  appId: "1:102076791930:web:d723812100b7950cb54fc3"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)