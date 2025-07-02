function App() {
  return (
    <div className="bg-gray-900 text-white min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">Split Spese</h1>

        {/* Sezione Riepilogo Saldi */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-2xl font-semibold mb-4">Riepilogo</h2>
          {/* Qui andranno i saldi calcolati */}
        </div>

        {/* Sezione Aggiungi Spesa */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-2xl font-semibold mb-4">Aggiungi Nuova Spesa</h2>
          {/* Qui andrà il form */}
        </div>

        {/* Sezione Elenco Spese */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Elenco Spese</h2>
          {/* Qui andrà la lista delle spese */}
        </div>

      </div>
    </div>
  )
}

export default App
