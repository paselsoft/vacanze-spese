import { useState, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, updateDoc, Timestamp, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const App = () => {
  // State for trips
  const [viaggi, setViaggi] = useState([]);
  const [viaggioSelezionato, setViaggioSelezionato] = useState('');
  const [nomeNuovoViaggio, setNomeNuovoViaggio] = useState('');
  const [showArchived, setShowArchived] = useState(false); // New state for showing archived trips

  // State for expenses (related to the selected trip)
  const [spese, setSpese] = useState([]);
  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [pagatoDa, setPagatoDa] = useState('Paolo');
  const [cassaComune, setCassaComune] = useState(false);
  const persone = ['Paolo', 'Barbara', 'Renata'];
  const [partecipanti, setPartecipanti] = useState(persone);
  const [editingSpesaId, setEditingSpesaId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [dataSpesa, setDataSpesa] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD format
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');

  // State for sorting and filtering
  const [sortBy, setSortBy] = useState('timestamp'); // 'timestamp', 'importo', 'descrizione'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [filterPagatoDa, setFilterPagatoDa] = useState(''); // Filter by who paid
  const [filterPartecipanti, setFilterPartecipanti] = useState([]); // Filter by participants

  // Helper function to clear messages after a delay
  const clearMessages = () => {
    setTimeout(() => {
      setErrorMessage('');
      setSuccessMessage('');
    }, 3000); // Clear messages after 3 seconds
  };

  const openModal = (imageUrl) => {
    setModalImageUrl(imageUrl);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalImageUrl('');
  };

  // Fetch trips on component mount
  useEffect(() => {
    let tripsQuery = query(collection(db, "viaggi"), orderBy("createdAt", "desc"));
    if (!showArchived) {
      tripsQuery = query(tripsQuery, where("isArchived", "==", false));
    }

    const unsubscribe = onSnapshot(tripsQuery, (snapshot) => {
      const viaggiData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setViaggi(viaggiData);
      // Automatically select the first trip if none is selected
      if (!viaggioSelezionato && viaggiData.length > 0) {
        setViaggioSelezionato(viaggiData[0].id);
      }
    });
    return () => unsubscribe();
  }, [viaggioSelezionato, showArchived]); // Add showArchived to dependency array

  // Fetch expenses for the selected trip
  useEffect(() => {
    if (!viaggioSelezionato) {
      setSpese([]);
      return;
    }

    const speseCollectionRef = collection(db, "viaggi", viaggioSelezionato, "spese");
    // Firestore query for initial fetch (always by timestamp desc)
    const q = query(speseCollectionRef, orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSpese = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSpese(fetchedSpese);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [viaggioSelezionato]);

  

  // Apply sorting and filtering to expenses for display
  const getFilteredAndSortedSpese = () => {
    let filteredSpese = [...spese];

    // Apply filters
    if (filterPagatoDa) {
      filteredSpese = filteredSpese.filter(spesa => spesa.pagatoDa === filterPagatoDa);
    }
    if (filterPartecipanti.length > 0) {
      filteredSpese = filteredSpese.filter(spesa =>
        filterPartecipanti.every(p => spesa.partecipanti && spesa.partecipanti.includes(p))
      );
    }

    // Apply sorting
    filteredSpese.sort((a, b) => {
      let compareValue = 0;
      if (sortBy === 'importo') {
        compareValue = a.importo - b.importo;
      } else if (sortBy === 'descrizione') {
        compareValue = a.descrizione.localeCompare(b.descrizione);
      } else if (sortBy === 'timestamp') {
        // For timestamp, compare Firebase Timestamps or fallback to creation order
        const aTime = a.timestamp ? a.timestamp.toDate().getTime() : 0;
        const bTime = b.timestamp ? b.timestamp.toDate().getTime() : 0;
        compareValue = aTime - bTime;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filteredSpese;
  };

  

  const modificaNomeViaggio = async () => {
    if (!viaggioSelezionato) return;

    const viaggioCorrente = viaggi.find(v => v.id === viaggioSelezionato);
    const nuovoNome = prompt("Inserisci il nuovo nome per il viaggio:", viaggioCorrente?.nome);

    if (nuovoNome && nuovoNome.trim() !== '' && nuovoNome !== viaggioCorrente?.nome) {
      const viaggioDocRef = doc(db, "viaggi", viaggioSelezionato);
      try {
        await updateDoc(viaggioDocRef, {
          nome: nuovoNome.trim(),
        });
        setSuccessMessage("Nome viaggio modificato con successo!");
        clearMessages();
      } catch (e) {
        console.error("Error updating document: ", e);
        setErrorMessage("Errore durante la modifica del nome del viaggio.");
        clearMessages();
      }
    }
  };

  const toggleArchiveViaggio = async () => {
    if (!viaggioSelezionato) return;
    const viaggioCorrente = viaggi.find(v => v.id === viaggioSelezionato);
    const newArchiveStatus = !viaggioCorrente.isArchived;
    const confirmMessage = newArchiveStatus
      ? `Sei sicuro di voler archiviare il viaggio \"${viaggioCorrente?.nome}\"? Non apparirà più nell'elenco principale.`
      : `Sei sicuro di voler disarchiviare il viaggio \"${viaggioCorrente?.nome}\"? Apparirà di nuovo nell'elenco principale.`

    if (window.confirm(confirmMessage)) {
      const viaggioDocRef = doc(db, "viaggi", viaggioSelezionato);
      try {
        await updateDoc(viaggioDocRef, {
          isArchived: newArchiveStatus,
        });
        setSuccessMessage(`Viaggio \"${viaggioCorrente?.nome}\" ${newArchiveStatus ? 'archiviato' : 'disarchiviato'} con successo!`);
        clearMessages();
      } catch (e) {
        console.error("Error toggling archive status: ", e);
        setErrorMessage("Errore durante l'archiviazione/disarchiviazione del viaggio.");
        clearMessages();
      }
    }
  };

  const handlePartecipanteChange = (persona) => {
    setPartecipanti((prev) =>
      prev.includes(persona)
        ? prev.filter((p) => p !== persona)
        : [...prev, persona]
    );
  };

  const aggiungiSpesa = async (e) => {
    e.preventDefault();
    setErrorMessage(''); // Clear previous errors
    setSuccessMessage(''); // Clear previous success messages

    if (!descrizione.trim()) {
      setErrorMessage("La descrizione della spesa è obbligatoria.");
      clearMessages();
      return;
    }
    if (isNaN(parseFloat(importo)) || parseFloat(importo) <= 0) {
      setErrorMessage("L'importo deve essere un numero valido e maggiore di zero.");
      clearMessages();
      return;
    }
    if (partecipanti.length === 0) {
      setErrorMessage("Seleziona almeno un partecipante.");
      clearMessages();
      return;
    }
    if (!viaggioSelezionato) {
      setErrorMessage("Seleziona un viaggio prima di aggiungere una spesa.");
      clearMessages();
      return;
    }

    let finalFileUrl = null;
    let finalFilePath = null;

    console.log("--- Inizio aggiungiSpesa ---");
    console.log("selectedFile:", selectedFile);
    console.log("filePreviewUrl (before processing):", filePreviewUrl);
    console.log("editingSpesaId:", editingSpesaId);

    try {
      if (selectedFile) {
        console.log("Case: selectedFile is present. Uploading new file...");
        const fileExtension = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExtension}`;
        const storageRef = ref(storage, `spese/${viaggioSelezionato}/${fileName}`);
        await uploadBytes(storageRef, selectedFile);
        finalFileUrl = await getDownloadURL(storageRef);
        finalFilePath = storageRef.fullPath;
        console.log("New file uploaded. finalFileUrl:", finalFileUrl, "finalFilePath:", finalFilePath);
      } else if (filePreviewUrl) {
        console.log("Case: No new file selected, but filePreviewUrl is present. Keeping existing file.");
        finalFileUrl = filePreviewUrl;
        // Retrieve original filePath for existing expense
        const oldSpesa = spese.find(s => s.id === editingSpesaId);
        finalFilePath = oldSpesa ? oldSpesa.filePath : null;
        console.log("Keeping existing file. finalFileUrl:", finalFileUrl, "finalFilePath:", finalFilePath);
      } else {
        console.log("Case: No file selected and no existing file to keep. File will be null.");
        // finalFileUrl and finalFilePath remain null
      }

      console.log("Final file values before spesaData:", { finalFileUrl, finalFilePath });

      const spesaData = {
      descrizione: descrizione.trim(),
      importo: parseFloat(importo),
      pagatoDa,
      partecipanti,
      cassaComune: pagatoDa === 'Barbara' && cassaComune,
      timestamp: editingSpesaId ? Timestamp.fromDate(new Date(dataSpesa)) : serverTimestamp(),
      fileUrl: finalFileUrl, // Save file URL
      filePath: finalFilePath, // Save file path for deletion
    };

      console.log("spesaData to be saved:", spesaData);

      if (editingSpesaId) {
        console.log("Attempting to update existing expense...");
        const spesaDocRef = doc(db, "viaggi", viaggioSelezionato, "spese", editingSpesaId);
        const oldSpesa = spese.find(s => s.id === editingSpesaId);

        // Delete old file if:
        // 1. A new file was selected (selectedFile is true)
        // 2. The existing file was explicitly removed (filePreviewUrl is null, but oldSpesa had a filePath)
        // 3. The old spesa actually had a file path
        if (oldSpesa && oldSpesa.filePath && (selectedFile || filePreviewUrl === null)) {
          console.log("Deleting old file from storage:", oldSpesa.filePath);
          const oldFileRef = ref(storage, oldSpesa.filePath);
          await deleteObject(oldFileRef).catch(e => console.warn("Could not delete old file: ", e));
        }

        await updateDoc(spesaDocRef, spesaData);
        console.log("Expense updated successfully!");
        setSuccessMessage("Spesa modificata con successo!");
        setEditingSpesaId(null);
      } else {
        console.log("Attempting to add new expense...");
        await addDoc(collection(db, "viaggi", viaggioSelezionato, "spese"), spesaData);
        console.log("Expense added successfully!");
        setSuccessMessage("Spesa aggiunta con successo!");
      }
      setDescrizione('');
      setImporto('');
      setPagatoDa('Paolo');
      setPartecipanti(persone);
      setCassaComune(false);
      setDataSpesa(new Date().toISOString().split('T')[0]); // Reset to current date
      setSelectedFile(null);
      setFilePreviewUrl(null);
      clearMessages();
      console.log("--- Fine aggiungiSpesa (Successo) ---");
    } catch (e) {
      console.error("Caught error in aggiungiSpesa:", e);
      setErrorMessage("Errore durante l'operazione sulla spesa: " + e.message);
      clearMessages();
      console.log("--- Fine aggiungiSpesa (Errore) ---");
    }
  };

  const modificaSpesa = (spesa) => {
    setErrorMessage(''); // Clear any existing error messages
    setSuccessMessage(''); // Clear any existing success messages
    setEditingSpesaId(spesa.id);
    setDescrizione(spesa.descrizione);
    setImporto(spesa.importo.toString());
    setPagatoDa(spesa.pagatoDa);
    setPartecipanti(spesa.partecipanti || persone);
    setCassaComune(spesa.cassaComune || false);
    // Set dataSpesa for editing
    if (spesa.timestamp) {
      const date = spesa.timestamp.toDate();
      setDataSpesa(date.toISOString().split('T')[0]);
    } else {
      setDataSpesa(new Date().toISOString().split('T')[0]);
    }
    setSelectedFile(null); // Clear selected file when editing
    setFilePreviewUrl(spesa.fileUrl || null); // Set preview for existing file
  };

  const annullaModifica = () => {
    setEditingSpesaId(null);
    setDescrizione('');
    setImporto('');
    setPagatoDa('Paolo');
    setPartecipanti(persone);
    setCassaComune(false);
    setDataSpesa(new Date().toISOString().split('T')[0]); // Reset to current date
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const eliminaSpesa = async (id) => {
    if (!viaggioSelezionato) return;
    try {
      const spesaToDelete = spese.find(s => s.id === id);
      if (spesaToDelete && spesaToDelete.filePath) {
        const fileRef = ref(storage, spesaToDelete.filePath);
        await deleteObject(fileRef).catch(e => console.warn("Could not delete file from storage: ", e));
      }
      await deleteDoc(doc(db, "viaggi", viaggioSelezionato, "spese", id));
      setSuccessMessage("Spesa eliminata con successo!");
      clearMessages();
    } catch (e) {
      console.error("Error removing document: ", e);
      setErrorMessage("Errore durante l'eliminazione della spesa.");
      clearMessages();
    }
  };

  const calcolaSaldi = () => {
    const debiti = persone.reduce((acc, p1) => ({ ...acc, [p1]: persone.reduce((acc2, p2) => ({ ...acc2, [p2]: 0 }), {}) }), {});

    spese.forEach((spesa) => {
      const { importo, pagatoDa, partecipanti, cassaComune: spesaCassaComune } = spesa;
      const partecipantiEffettivi = partecipanti || persone;
      
      if (partecipantiEffettivi.length === 0) return;
      
      const quota = importo / partecipantiEffettivi.length;

      partecipantiEffettivi.forEach((p) => {
        if (p === pagatoDa) return;

        if (pagatoDa === 'Barbara' && spesaCassaComune && p === 'Paolo') {
          return;
        }
        
        debiti[p][pagatoDa] += quota;
      });
    });

    const personeCopy = [...persone];
    while (personeCopy.length > 1) {
      const p1 = personeCopy.pop();
      personeCopy.forEach((p2) => {
        const debitoP1P2 = debiti[p1][p2];
        const debitoP2P1 = debiti[p2][p1];
        if (debitoP1P2 > debitoP2P1) {
          debiti[p1][p2] -= debitoP2P1;
          debiti[p2][p1] = 0;
        } else {
          debiti[p2][p1] -= debitoP1P2;
          debiti[p1][p2] = 0;
        }
      });
    }

    const debitiRaggruppati = {};
    for (const debitore in debiti) {
      let totaleDebitore = 0;
      const creditori = [];
      for (const creditore in debiti[debitore]) {
        const importoDebito = debiti[debitore][creditore];
        if (importoDebito > 0.01) {
          totaleDebitore += importoDebito;
          creditori.push({ nome: creditore, importo: importoDebito });
        }
      }
      if (totaleDebitore > 0) {
        debitiRaggruppati[debitore] = {
          totale: totaleDebitore,
          dettaglio: creditori,
        };
      }
    }
    return debitiRaggruppati;
  };

  const resetSpese = async () => {
    if (!viaggioSelezionato) return;
    if (window.confirm(`Sei sicuro di voler eliminare tutte le spese per il viaggio "${viaggi.find(v => v.id === viaggioSelezionato)?.nome}"?`)) {
      try {
        const speseCollectionRef = collection(db, "viaggi", viaggioSelezionato, "spese");
        const querySnapshot = await getDocs(speseCollectionRef);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(d => {
            batch.delete(d.ref);
        });
        await batch.commit();
        setSuccessMessage("Tutte le spese del viaggio sono state eliminate!");
        clearMessages();
      } catch (e) {
        console.error("Error resetting expenses: ", e);
        setErrorMessage("Errore durante il reset delle spese.");
        clearMessages();
      }
    }
  };

  const eliminaViaggio = async () => {
    if (!viaggioSelezionato) return;
    const viaggioCorrente = viaggi.find(v => v.id === viaggioSelezionato);
    if (window.confirm(`Sei sicuro di voler eliminare il viaggio \"${viaggioCorrente?.nome}\" e tutte le sue spese? Questa azione è irreversibile.`)) {
      try {
        // 1. Elimina tutte le spese del viaggio
        const speseCollectionRef = collection(db, "viaggi", viaggioSelezionato, "spese");
        const querySnapshot = await getDocs(speseCollectionRef);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(d => {
            batch.delete(d.ref);
        });
        await batch.commit();

        // 2. Elimina il documento del viaggio
        await deleteDoc(doc(db, "viaggi", viaggioSelezionato));

        setSuccessMessage(`Viaggio \"${viaggioCorrente?.nome}\" eliminato con successo!`);
        clearMessages();
        setViaggioSelezionato(''); // Deseleziona il viaggio eliminato
      } catch (e) {
        console.error("Error deleting trip: ", e);
        setErrorMessage("Errore durante l'eliminazione del viaggio.");
        clearMessages();
      }
    }
  };

  const esportaSpeseInCsv = () => {
    if (spese.length === 0) {
      setErrorMessage("Nessuna spesa da esportare.");
      clearMessages();
      return;
    }

    const headers = ["Descrizione", "Importo", "Pagato da", "Partecipanti", "Cassa Comune", "Data"];
    const rows = spese.map(spesa => [
      `\"${spesa.descrizione.replace(/\"/g, '\"\"')}\" `,
      spesa.importo.toFixed(2),
      spesa.pagatoDa,
      `\"${(spesa.partecipanti || []).join(', ').replace(/\"/g, '\"\"')}\" `,
      spesa.cassaComune ? "Sì" : "No",
      spesa.timestamp ? new Date(spesa.timestamp.toDate()).toLocaleString() : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `spese_${viaggi.find(v => v.id === viaggioSelezionato)?.nome || 'viaggio'}.csv`);
    link.click();

    setSuccessMessage("Spese esportate con successo in CSV!");
    clearMessages();
  };

  const aggiungiViaggio = async (e) => {
    e.preventDefault();
    if (!nomeNuovoViaggio.trim()) {
      setErrorMessage("Il nome del viaggio non può essere vuoto.");
      clearMessages();
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "viaggi"), {
        nome: nomeNuovoViaggio.trim(),
        createdAt: serverTimestamp(),
        isArchived: false,
      });
      setSuccessMessage("Viaggio creato con successo!");
      clearMessages();
      setNomeNuovoViaggio('');
      setViaggioSelezionato(docRef.id); // Select the newly created trip
    } catch (e) {
      console.error("Error adding document: ", e);
      setErrorMessage("Errore durante la creazione del viaggio.");
      clearMessages();
    }
  };

  const saldi = calcolaSaldi();

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl p-6 sm:p-8 lg:p-10">
        <h1 className="text-4xl font-extrabold mb-8 text-center text-gray-900 tracking-tight">Alla Romana</h1>

        {/* Trip Management */}
        <div className="mb-8 p-5 bg-gray-100 rounded-lg border border-gray-200">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Gestione Viaggio</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                {/* Create Trip Form */}
                <form onSubmit={aggiungiViaggio} className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Nome nuovo viaggio"
                        value={nomeNuovoViaggio}
                        onChange={(e) => setNomeNuovoViaggio(e.target.value)}
                        className="p-3 w-full border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                    />
                    <button type="submit" className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 ease-in-out font-semibold shadow-md">
                        Crea
                    </button>
                </form>
                {/* Trip Selector */}
                <div className="flex items-center gap-2">
                    <select
                        id="trip-select"
                        value={viaggioSelezionato}
                        onChange={(e) => setViaggioSelezionato(e.target.value)}
                        className="p-3 w-full border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        disabled={viaggi.length === 0}
                    >
                        {viaggi.length === 0 ? (
                            <option>Nessun viaggio creato</option>
                        ) : (
                            viaggi.map((viaggio) => (
                                <option key={viaggio.id} value={viaggio.id}>{viaggio.nome}</option>
                            ))
                        )}
                    </select>
                    <button onClick={modificaNomeViaggio} disabled={!viaggioSelezionato} className="bg-yellow-500 text-white p-3 rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition duration-300 ease-in-out font-semibold shadow-md disabled:bg-gray-400">
                        Modifica
                    </button>
                    <button onClick={eliminaViaggio} disabled={!viaggioSelezionato} className="bg-red-500 text-white p-3 rounded-lg hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-300 transition duration-300 ease-in-out font-semibold shadow-md disabled:bg-gray-400">
                        Elimina Viaggio
                    </button>
                    <button onClick={toggleArchiveViaggio} disabled={!viaggioSelezionato} className="bg-purple-600 text-white p-3 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out font-semibold shadow-md disabled:bg-gray-400">
                      {viaggi.find(v => v.id === viaggioSelezionato)?.isArchived ? 'Disarchivia Viaggio' : 'Archivia Viaggio'}
                    </button>
                </div>
                <div className="md:col-span-2 flex items-center mt-4 md:mt-0">
                  <input
                    type="checkbox"
                    id="showArchived"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition duration-200"
                  />
                  <label htmlFor="showArchived" className="ml-2 block text-sm text-gray-900 font-medium">
                    Mostra viaggi archiviati
                  </label>
                </div>
            </div>
        </div>

        {viaggioSelezionato ? (
          <>
            {/* Riepilogo Saldi */}
            <div className="mb-8 p-5 bg-blue-50 rounded-lg border border-blue-200">
              <h2 className="text-2xl font-semibold mb-3 text-blue-800 flex items-center">
                Riepilogo Saldi
              </h2>
              {Object.keys(saldi).length > 0 ? (
                <ul className="space-y-3">
                  {Object.entries(saldi).map(([debitore, infoDebito], index) => (
                    <li key={index} className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                      <p className="font-bold text-lg text-gray-800">
                        {debitore} deve un totale di {infoDebito.totale.toFixed(2)}€
                      </p>
                      <ul className="mt-2 pl-4 space-y-1 list-disc list-inside">
                        {infoDebito.dettaglio.map((debito, i) => (
                          <li key={i} className="text-gray-600">
                            {debito.importo.toFixed(2)}€ a {debito.nome}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600 text-lg flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      I conti sono in pari. Ottimo lavoro!
                    </p>
                  )}
                </div>

                {/* Form Aggiunta Spesa */}
                {errorMessage && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Errore:</strong>
                    <span className="block sm:inline"> {errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Successo:</strong>
                    <span className="block sm:inline"> {successMessage}</span>
                  </div>
                )}
                <form onSubmit={aggiungiSpesa} className="mb-10 p-6 bg-gray-50 rounded-xl shadow-inner border border-gray-200">
                  <h2 className="text-2xl font-semibold mb-5 text-gray-800">Aggiungi una nuova spesa</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-4">
                    <input
                      type="text"
                      placeholder="Descrizione della spesa"
                      value={descrizione}
                      onChange={(e) => setDescrizione(e.target.value)}
                      className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                    />
                    <input
                      type="number"
                      placeholder="Importo (€)"
                      value={importo}
                      onChange={(e) => setImporto(e.target.value)}
                      className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                    />
                    <input
                      type="date"
                      value={dataSpesa}
                      onChange={(e) => setDataSpesa(e.target.value)}
                      className="p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                    />
                    <select
                      value={pagatoDa}
                      onChange={(e) => setPagatoDa(e.target.value)}
                      className="p-3 border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                    >
                      {persone.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="scontrinoFile" className="block text-sm font-medium text-gray-700 mb-1">Allega Scontrino/Fattura (Max 5MB):</label>
                    <input
                      type="file"
                      id="scontrinoFile"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file && file.size > 5 * 1024 * 1024) { // 5MB limit
                          setErrorMessage("Il file è troppo grande (max 5MB).");
                          clearMessages();
                          setSelectedFile(null);
                          setFilePreviewUrl(null);
                          return;
                        }
                        setSelectedFile(file);
                        setFilePreviewUrl(file ? URL.createObjectURL(file) : null);
                      }}
                      className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {(filePreviewUrl && !selectedFile) && ( // Show existing file preview if no new file is selected
                      <div className="mt-2 flex items-center space-x-2">
                        <p className="text-sm text-gray-600">File corrente: <a href={filePreviewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Visualizza</a></p>
                        <button type="button" onClick={() => setFilePreviewUrl(null)} className="text-red-500 hover:text-red-700 text-sm">
                          Rimuovi
                        </button>
                      </div>
                    )}
                    {selectedFile && (
                      <div className="mt-2 flex items-center space-x-2">
                        <p className="text-sm text-gray-600">File selezionato: {selectedFile.name}</p>
                        <button type="button" onClick={() => { setSelectedFile(null); setFilePreviewUrl(null); }} className="text-red-500 hover:text-red-700 text-sm">
                          Rimuovi
                        </button>
                      </div>
                    )}
                  </div>
                  {pagatoDa === 'Barbara' && (
                    <div className="mt-4 mb-4 flex items-center">
                      <input
                        type="checkbox"
                        id="cassaComune"
                        checked={cassaComune}
                        onChange={(e) => setCassaComune(e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition duration-200"
                      />
                      <label htmlFor="cassaComune" className="ml-3 block text-base text-gray-900 font-medium">
                        Pagato con cassa comune?
                      </label>
                    </div>
                  )}
                  <div className="mt-5 mb-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">Partecipanti alla spesa:</h3>
                    <div className="flex flex-wrap gap-4">
                      {persone.map((p) => (
                        <label key={p} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={partecipanti.includes(p)}
                            onChange={() => handlePartecipanteChange(p)}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition duration-200"
                          />
                          <span className="text-gray-800 text-base">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition duration-300 ease-in-out text-lg font-semibold shadow-md">
                    {editingSpesaId ? 'Salva Modifiche' : 'Aggiungi Spesa'}
                  </button>
                  {editingSpesaId && (
                    <button type="button" onClick={annullaModifica} className="w-full mt-3 bg-gray-400 text-white p-3 rounded-lg hover:bg-gray-500 focus:outline-none focus:ring-4 focus:ring-gray-300 transition duration-300 ease-in-out text-lg font-semibold shadow-md">
                      Annulla Modifica
                    </button>
                  )}
                </form>

                {/* Elenco Spese */}
                <div>
                  <h2 className="text-2xl font-semibold mb-4 text-gray-800">Elenco Spese</h2>

                  {/* Sorting and Filtering Controls */}
                  <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 mb-1">Ordina per:</label>
                      <select
                        id="sortBy"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="p-2 w-full border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                      >
                        <option value="timestamp">Data</option>
                        <option value="importo">Importo</option>
                        <option value="descrizione">Descrizione</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 mb-1">Ordine:</label>
                      <select
                        id="sortOrder"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="p-2 w-full border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                      >
                        <option value="desc">Decrescente</option>
                        <option value="asc">Crescente</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="filterPagatoDa" className="block text-sm font-medium text-gray-700 mb-1">Filtrato da:</label>
                      <select
                        id="filterPagatoDa"
                        value={filterPagatoDa}
                        onChange={(e) => setFilterPagatoDa(e.target.value)}
                        className="p-2 w-full border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                      >
                        <option value="">Tutti</option>
                        {persone.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Filtra per partecipanti:</label>
                      <div className="flex flex-wrap gap-3">
                        {persone.map((p) => (
                          <label key={`filter-${p}`} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filterPartecipanti.includes(p)}
                              onChange={() => {
                                setFilterPartecipanti((prev) =>
                                  prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
                                );
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition duration-200"
                            />
                            <span className="text-gray-800 text-sm">{p}</span>
                          </label>
                        ))}
                        <button
                          onClick={() => setFilterPartecipanti([])}
                          className="ml-auto px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition duration-200"
                        >
                          Reset Filtri Partecipanti
                        </button>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-4">
                    {getFilteredAndSortedSpese().map((spesa) => (
                      <li key={spesa.id} className="p-5 bg-white shadow-lg rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-200">
                        <div className="mb-2 sm:mb-0">
                          <p className="font-bold text-xl text-gray-900">{spesa.descrizione} {spesa.cassaComune && <span className="text-sm text-blue-600 font-medium">(Cassa Comune)</span>}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Pagato da:</span> {spesa.pagatoDa} | <span className="font-medium">Partecipanti:</span> {spesa.partecipanti ? spesa.partecipanti.join(', ') : 'Tutti'} | <span className="font-medium">Data:</span> {spesa.timestamp ? new Date(spesa.timestamp.toDate()).toLocaleDateString() : 'N/A'}
                            {spesa.fileUrl && (
                              <span className="ml-2">
                                | <button onClick={() => openModal(spesa.fileUrl)} className="text-blue-600 hover:underline font-medium focus:outline-none">
                                  Scontrino
                                </button>
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="font-extrabold text-2xl text-green-700">{spesa.importo.toFixed(2)}€</span>
                          <button onClick={() => modificaSpesa(spesa)} className="text-blue-500 hover:text-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-md p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => eliminaSpesa(spesa.id)} className="text-red-500 hover:text-red-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-300 rounded-md p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Reset Button */}
                <div className="mt-10 text-center">
                  <button onClick={resetSpese} className="bg-red-600 text-white p-3 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 transition duration-300 ease-in-out text-lg font-semibold shadow-md">
                    Reset Viaggio Corrente
                  </button>
                  <button onClick={esportaSpeseInCsv} className="ml-4 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 ease-in-out text-lg font-semibold shadow-md">
                    Esporta Spese (CSV)
                  </button>
                </div>
              </>
            ) : (
                <div className="text-center p-10 bg-gray-50 rounded-lg">
                    <h2 className="text-2xl font-semibold text-gray-700">Nessun viaggio selezionato</h2>
                    <p className="text-gray-500 mt-2">Crea un nuovo viaggio o selezionane uno esistente per iniziare.</p>
                </div>
            )}

        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-lg p-4 max-w-3xl max-h-full overflow-auto">
            <button
              onClick={closeModal}
              className="absolute top-2 right-2 text-gray-700 hover:text-gray-900 text-3xl font-bold"
            >
              &times;
            </button>
            <img src={modalImageUrl} alt="Scontrino" className="max-w-full h-auto" />
          </div>
        </div>
      )}
    </>
  );
};

export default App;