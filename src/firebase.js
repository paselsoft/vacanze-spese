import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCQD2CQXYrBdOD8pqsoMe-XOKcTgyFz3sk",
  authDomain: "spendwise-rk818.firebaseapp.com",
  projectId: "spendwise-rk818",
  storageBucket: "spendwise-rk818.firebasestorage.app",
  messagingSenderId: "598940358332",
  appId: "1:598940358332:web:f86769131197151ff7e2b9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };