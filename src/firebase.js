import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvwKYDWQOVClfWczkvOLXT0CumfRb-YxA",
  authDomain: "tennisready-feff4.firebaseapp.com",
  projectId: "tennisready-feff4",
  storageBucket: "tennisready-feff4.firebasestorage.app",
  messagingSenderId: "127443595268",
  appId: "1:127443595268:web:9100d03e714d385ddd4551"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
