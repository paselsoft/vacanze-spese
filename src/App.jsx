import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore';

const App = () => {
  // State for trips
  const [viaggi, setViaggi] = useState([]);
  const [viaggioSelezionato, setViaggioSelezionato] = useState('');
  const [nomeNuovoViaggio, setNomeNuovoViaggio] = useState('');

  // State for expenses (related to the selected trip)
  const [spese, setSpese] = useState([]);
  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [pagatoDa, setPagatoDa] = useState('Paolo');
  const [cassaComune, setCassaComune] = useState(false);
  const persone = ['Paolo', 'Barbara', 'Renata'];
  const [partecipanti, setPartecipanti] = useState(persone);

  // Fetch trips on component mount
  useEffect(() => {
    const q = query(collection(db, "viaggi"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
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
  }, [viaggioSelezionato]); // Dependency ensures we can select a new trip after creation

  // Fetch expenses for the selected trip
  useEffect(() => {
    if (!viaggioSelezionato) {
      setSpese([]);
      return;
    }

    const speseCollectionRef = collection(db, "viaggi", viaggioSelezionato, "spese");
    const q = query(speseCollectionRef, orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const speseData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSpese(speseData);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [viaggioSelezionato]);

  const aggiungiViaggio = async (e) => {
    e.preventDefault();
    if (!nomeNuovoViaggio.trim()) return;

    try {
      const nuovoViaggioRef = await addDoc(collection(db, "viaggi"), {
        nome: nomeNuovoViaggio,
        createdAt: serverTimestamp(),
      });
      setNomeNuovoViaggio('');
      setViaggioSelezionato(nuovoViaggioRef.id); // Automatically select the new trip
    } catch (e) {
      console.error("Error adding document: ", e);
    }
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
      } catch (e) {
        console.error("Error updating document: ", e);
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
    if (!descrizione || !importo || partecipanti.length === 0 || !viaggioSelezionato) return;

    const nuovaSpesa = {
      descrizione,
      importo: parseFloat(importo),
      pagatoDa,
      partecipanti,
      cassaComune: pagatoDa === 'Barbara' && cassaComune,
      timestamp: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "viaggi", viaggioSelezionato, "spese"), nuovaSpesa);
      setDescrizione('');
      setImporto('');
      setPartecipanti(persone);
      setCassaComune(false);
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  const eliminaSpesa = async (id) => {
    if (!viaggioSelezionato) return;
    try {
      await deleteDoc(doc(db, "viaggi", viaggioSelezionato, "spese", id));
    } catch (e) {
      console.error("Error removing document: ", e);
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
    if (window.confirm(`Sei sicuro di voler eliminare tutte le spese per il viaggio \"${viaggi.find(v => v.id === viaggioSelezionato)?.nome}\"?`)) {
      try {
        const speseCollectionRef = collection(db, "viaggi", viaggioSelezionato, "spese");
        const querySnapshot = await getDocs(speseCollectionRef);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(d => {
            batch.delete(d.ref);
        });
        await batch.commit();
      } catch (e) {
        console.error("Error resetting expenses: ", e);
      }
    }
  };

  const saldi = calcolaSaldi();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl p-6 sm:p-8 lg:p-10">
        <h1 className="text-4xl font-extrabold mb-8 text-center text-gray-900 tracking-tight">Split Spese</h1>

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
                    Aggiungi Spesa
                  </button>
                </form>

                {/* Elenco Spese */}
                <div>
                  <h2 className="text-2xl font-semibold mb-4 text-gray-800">Elenco Spese</h2>
                  <ul className="space-y-4">
                    {spese.map((spesa) => (
                      <li key={spesa.id} className="p-5 bg-white shadow-lg rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-200">
                        <div className="mb-2 sm:mb-0">
                          <p className="font-bold text-xl text-gray-900">{spesa.descrizione} {spesa.cassaComune && <span className="text-sm text-blue-600 font-medium">(Cassa Comune)</span>}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Pagato da:</span> {spesa.pagatoDa} | <span className="font-medium">Partecipanti:</span> {spesa.partecipanti ? spesa.partecipanti.join(', ') : 'Tutti'}
                          </p>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="font-extrabold text-2xl text-green-700">{spesa.importo.toFixed(2)}€</span>
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
      );
    };

    export default App;