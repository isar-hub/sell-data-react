import './App.css'
import Chart from './components/Chart'

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="header bg-white shadow-md p-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-blue-600 rounded-lg mr-4 flex items-center justify-center text-white font-bold text-xl">
            FS
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">Fractal Street</h1>
        </div>
        <div className="text-gray-600 font-medium">
          TSLA 1-Minute Chart
        </div>
      </div>
      
      <div className="flex-grow">
        <Chart />
      </div>
    </div>
  )
}

export default App
