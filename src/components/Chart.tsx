import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import Papa from 'papaparse';
import { ApexOptions } from 'apexcharts';

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  signal?: 'buy' | 'sell' | null;
}

interface CSVRow {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ParseResult {
  data: CSVRow[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

const parseDate = (dateStr: string): Date => {
  try {
    const [date, time] = dateStr.split(' ');
    const [day, month, year] = date.split('-');
    const [hours, minutes] = time.split(':');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
  } catch (error) {
    console.error('Error parsing date:', dateStr, error);
    return new Date(); // Return current date as fallback
  }
};

const Chart: React.FC = () => {
  const [data, setData] = useState<CandleData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'1m'|'5m'|'15m'|'1h'|'all'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [maxScrollOffset, setMaxScrollOffset] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('Fetching CSV file...');
        const response = await fetch('/csv_tsla.csv');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        console.log('CSV file loaded, length:', csvText.length);

        Papa.parse<CSVRow>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results: ParseResult) => {
            console.log('Number of rows parsed:', results.data.length);
            if (results.data.length > 0) {
              console.log('First row sample:', results.data[0]);
            }
            console.log('Parse errors:', results.errors);

            if (results.data.length === 0) {
              setError('No data found in CSV');
              setLoading(false);
              return;
            }

            // Filter and validate the data
            const parsedData = results.data
              .filter(row => {
                const hasAllFields = row.timestamp && row.open && row.high && row.low && row.close && row.volume;
                if (!hasAllFields) {
                  console.log('Row missing fields:', row);
                  return false;
                }

                const open = parseFloat(row.open);
                const high = parseFloat(row.high);
                const low = parseFloat(row.low);
                const close = parseFloat(row.close);
                const volume = parseInt(row.volume);

                const isValidNumbers = !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close) && !isNaN(volume);
                if (!isValidNumbers) {
                  console.log('Row has invalid numbers:', row);
                  return false;
                }

                return true;
              })
              .map((row: CSVRow) => ({
                timestamp: row.timestamp,
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseInt(row.volume),
                signal: null as null
              }));

            console.log('Number of valid rows after filtering:', parsedData.length);
            if (parsedData.length > 0) {
              console.log('First valid row sample:', parsedData[0]);
              console.log('Last valid row sample:', parsedData[parsedData.length - 1]);
            }
            
            if (parsedData.length === 0) {
              setError('Failed to parse any valid data from CSV');
              setLoading(false);
              return;
            }

            // Sort data by timestamp (newest first)
            parsedData.sort((a, b) => {
              const dateA = parseDate(a.timestamp);
              const dateB = parseDate(b.timestamp);
              return dateB.getTime() - dateA.getTime();
            });

            // Add buy/sell signals based on price movement
            const dataWithSignals = parsedData.map((item: CandleData, index: number): CandleData => {
              if (index === parsedData.length - 1) return item; // Skip last item (oldest)
              
              const nextItem = parsedData[index + 1]; // Next item is older in time
              if (item.close > nextItem.close * 1.005) { // 0.5% increase
                return { ...item, signal: 'buy' as const };
              } else if (item.close < nextItem.close * 0.995) { // 0.5% decrease
                return { ...item, signal: 'sell' as const };
              }
              return item;
            });

            console.log('Final data sample (first 5):', dataWithSignals.slice(0, 5));
            setData(dataWithSignals);
            setLoading(false);
          },
          error: (error: Error) => {
            console.error('Parse error:', error);
            setError('Error parsing CSV data: ' + error.message);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Fetch error:', error);
        setError('Error loading CSV file: ' + (error instanceof Error ? error.message : 'Unknown error'));
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Reset scroll offset when timeframe changes
  useEffect(() => {
    setScrollOffset(0);
  }, [timeframe]);

  // Function to filter data based on timeframe and scroll offset
  const getFilteredData = () => {
    if (timeframe === 'all' || data.length === 0) return data;
    
    // Get the timestamp of the most recent data point
    const mostRecentDate = parseDate(data[0].timestamp);
    let minutesToSubtract = 60; // Default 1 hour
    let dataPointsPerTimeframe = 60; // Approximate number of data points in the timeframe
    
    switch(timeframe) {
      case '1m': 
        minutesToSubtract = 1; 
        dataPointsPerTimeframe = 1;
        break;
      case '5m': 
        minutesToSubtract = 5; 
        dataPointsPerTimeframe = 5;
        break;
      case '15m': 
        minutesToSubtract = 15; 
        dataPointsPerTimeframe = 15;
        break;
      case '1h': 
        minutesToSubtract = 60; 
        dataPointsPerTimeframe = 60;
        break;
    }
    
    // Calculate the offset time based on scroll offset
    const offsetMinutes = scrollOffset * minutesToSubtract;
    const offsetTime = new Date(mostRecentDate.getTime() - (offsetMinutes * 60 * 1000));
    
    // Calculate cutoff time based on the offset time
    const cutoffTime = new Date(offsetTime.getTime() - (minutesToSubtract * 60 * 1000));
    

    
    // Filter data points between cutoff time and offset time
    const filtered = data.filter(item => {
      const itemDate = parseDate(item.timestamp);
      const isIncluded = itemDate >= cutoffTime && itemDate <= offsetTime;
      return isIncluded;
    });
    
    console.log(`Filtered to ${filtered.length} points for ${timeframe} timeframe with offset ${scrollOffset}`);
    
    // If we have no data after filtering, return a small subset of the most recent data
    if (filtered.length === 0) {
      console.log('No data after filtering, returning most recent data');
      return data.slice(0, dataPointsPerTimeframe); // Return one timeframe worth of data
    }
    
    return filtered;
  };

  // Add a new useEffect to update maxScrollOffset when data or timeframe changes
  useEffect(() => {
    if (data.length === 0 || timeframe === 'all') {
      setMaxScrollOffset(0);
      return;
    }
    
    let dataPointsPerTimeframe = 60; // Default for 1h
    
    switch(timeframe) {
      case '1m': dataPointsPerTimeframe = 1; break;
      case '5m': dataPointsPerTimeframe = 5; break;
      case '15m': dataPointsPerTimeframe = 15; break;
      case '1h': dataPointsPerTimeframe = 60; break;
    }
    
    const totalAvailableTimeframes = Math.floor(data.length / dataPointsPerTimeframe) - 1;
    setMaxScrollOffset(Math.max(0, totalAvailableTimeframes));
  }, [data, timeframe]);

  if (error) {
    return (
      <div className="bg-white rounded-lg p-5 shadow-md mx-5 my-5">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (loading || data.length === 0) {
    return (
      <div className="bg-white rounded-lg p-5 shadow-md mx-5 my-5">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <div className="ml-4 text-lg">Loading data...</div>
        </div>
      </div>
    );
  }

  // Get filtered data based on selected timeframe and scroll offset
  const filteredData = getFilteredData();

  // Ensure we have data after filtering
  if (filteredData.length === 0) {
    return (
      <div className="bg-white rounded-lg p-5 shadow-md mx-5 my-5">
        <div className="text-amber-600">No data available for the selected timeframe. Try a different timeframe.</div>
        <div className="flex space-x-2 mt-4">
          <button 
            className={`px-3 py-1 rounded bg-blue-600 text-white`}
            onClick={() => setTimeframe('all')}
          >
            Show All Data
          </button>
        </div>
      </div>
    );
  }

  // Calculate moving averages
  const calculateSMA = (period: number) => {
    if (filteredData.length < period) return filteredData.map(() => null);
    
    return filteredData.map((item, index) => {
      if (index < period - 1) return null;
      
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += filteredData[index - i].close;
      }
      
      return sum / period;
    });
  };

  const sma20 = calculateSMA(20);
  const sma50 = calculateSMA(50);

  // Format data for ApexCharts
  const formattedData = filteredData.map(item => ({
    x: parseDate(item.timestamp).getTime(),
    y: [item.open, item.high, item.low, item.close]
  }));

  console.log('Formatted data sample:', formattedData.slice(0, 3));

  const chartData = {
    series: [
      {
        name: 'TSLA',
        data: formattedData
      },
      {
        name: 'SMA 20',
        type: 'line',
        data: filteredData.map((item, index) => ({
          x: parseDate(item.timestamp).getTime(),
          y: sma20[index]
        })).filter(item => item.y !== null)
      },
      {
        name: 'SMA 50',
        type: 'line',
        data: filteredData.map((item, index) => ({
          x: parseDate(item.timestamp).getTime(),
          y: sma50[index]
        })).filter(item => item.y !== null)
      }
    ],
    options: {
      chart: {
        type: 'candlestick' as const,
        height: 500,
        toolbar: {
          show: true,
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true
          }
        },
        animations: {
          enabled: false
        },
        background: '#fff',
        redrawOnWindowResize: true,
        zoom: {
          enabled: true,
          type: 'x',
          autoScaleYaxis: true
        }
      },
      title: {
        text: `TSLA ${timeframe} Candlestick Chart${scrollOffset > 0 ? ` (Historical -${scrollOffset})` : ''}`,
        align: 'left',
        style: {
          fontSize: '16px',
          fontWeight: 'bold'
        }
      },
      grid: {
        show: true,
        borderColor: '#f0f0f0',
        strokeDashArray: 0
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeFormatter: {
            year: 'yyyy',
            month: "MMM 'yy",
            day: 'dd MMM',
            hour: 'HH:mm'
          },
          style: {
            fontSize: '12px'
          }
        },
        axisBorder: {
          show: true
        },
        axisTicks: {
          show: true
        }
      },
      yaxis: [
        {
          tooltip: {
            enabled: true
          },
          labels: {
            formatter: (value: number) => `$${value.toFixed(2)}`,
            style: {
              fontSize: '12px'
            }
          }
        }
      ],
      tooltip: {
        enabled: true,
        theme: 'light',
        shared: true,
        x: {
          format: 'MMM dd HH:mm'
        },
        y: {
          formatter: (value: number) => `$${value.toFixed(2)}`
        },
        custom: ({ seriesIndex, dataPointIndex, w }: any) => {
          if (seriesIndex !== 0) return '';
          
          const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex];
          const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex];
          const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex];
          const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex];
          const vol = filteredData[dataPointIndex]?.volume;
          const signal = filteredData[dataPointIndex]?.signal;
          
          let signalHtml = '';
          if (signal === 'buy') {
            signalHtml = '<div class="text-green-600 font-bold">BUY SIGNAL</div>';
          } else if (signal === 'sell') {
            signalHtml = '<div class="text-red-600 font-bold">SELL SIGNAL</div>';
          }
          
          return `
            <div class="p-2">
              <div class="text-xs text-gray-500">${w.globals.labels[dataPointIndex]}</div>
              <div class="grid grid-cols-2 gap-2 mt-1">
                <div>Open:</div><div class="text-right">$${o.toFixed(2)}</div>
                <div>High:</div><div class="text-right">$${h.toFixed(2)}</div>
                <div>Low:</div><div class="text-right">$${l.toFixed(2)}</div>
                <div>Close:</div><div class="text-right">$${c.toFixed(2)}</div>
                <div>Volume:</div><div class="text-right">${vol?.toLocaleString()}</div>
              </div>
              ${signalHtml}
            </div>
          `;
        }
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: '#00C853',
            downward: '#D32F2F',
            border: {
              upward: '#00C853',
              downward: '#D32F2F'
            }
          },
          wick: {
            useFillColor: true
          }
        }
      },
      stroke: {
        curve: 'smooth',
        width: [1, 2, 2]
      },
      legend: {
        show: true,
        position: 'top'
      },
      annotations: {
        points: filteredData
          .filter(item => item.signal)
          .map(item => ({
            x: parseDate(item.timestamp).getTime(),
            y: item.signal === 'buy' ? item.low * 0.998 : item.high * 1.002,
            marker: {
              size: 6,
              fillColor: item.signal === 'buy' ? '#00C853' : '#D32F2F',
              strokeColor: '#fff',
              strokeWidth: 2,
              shape: item.signal === 'buy' ? 'triangle' : 'triangle-down'
            },
            label: {
              text: item.signal === 'buy' ? 'BUY' : 'SELL',
              style: {
                color: '#fff',
                background: item.signal === 'buy' ? '#00C853' : '#D32F2F'
              }
            }
          }))
      }
    } as ApexOptions
  };

  return (
    <div className="bg-white shadow-md w-full">
      <div className="p-4 border-b flex justify-between items-center">
        <div className="text-lg font-semibold">TSLA Price: ${filteredData[0]?.close.toFixed(2)}</div>
        <div className="flex space-x-2">
          <button 
            className={`px-3 py-1 rounded ${timeframe === '1m' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTimeframe('1m')}
          >
            1m
          </button>
          <button 
            className={`px-3 py-1 rounded ${timeframe === '5m' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTimeframe('5m')}
          >
            5m
          </button>
          <button 
            className={`px-3 py-1 rounded ${timeframe === '15m' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTimeframe('15m')}
          >
            15m
          </button>
          <button 
            className={`px-3 py-1 rounded ${timeframe === '1h' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTimeframe('1h')}
          >
            1h
          </button>
          <button 
            className={`px-3 py-1 rounded ${timeframe === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTimeframe('all')}
          >
            All
          </button>
        </div>
      </div>
      
      {/* Navigation controls for scrolling through historical data */}
      {timeframe !== 'all' && (
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button 
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
              onClick={() => setScrollOffset(Math.max(0, scrollOffset - 1))}
              disabled={scrollOffset === 0}
            >
              ← Newer
            </button>
            <button 
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
              onClick={() => setScrollOffset(Math.min(maxScrollOffset, scrollOffset + 1))}
              disabled={scrollOffset >= maxScrollOffset}
            >
              Older →
            </button>
          </div>
          <div className="text-sm text-gray-600">
            {scrollOffset > 0 ? `Historical data (${scrollOffset} periods back)` : 'Most recent data'}
          </div>
        </div>
      )}
      
      <ReactApexChart
        options={chartData.options}
        series={chartData.series}
        type="candlestick"
        height={600}
      />
    </div>
  );
};

export default Chart; 