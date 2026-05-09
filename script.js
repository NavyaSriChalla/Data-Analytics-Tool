document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const fileInput = document.getElementById('csv-upload');
    const uploadStatus = document.getElementById('upload-status');
    const controlsSection = document.getElementById('controls-section');
    const insightsSection = document.getElementById('insights-section');
    const statsGrid = document.getElementById('stats-grid');
    const tableSection = document.getElementById('table-section');
    const chartsSection = document.getElementById('charts-section');
    
    // Table Elements
    const tableHeadRow = document.getElementById('table-head-row');
    const tableBody = document.getElementById('table-body');
    const rowCountEl = document.getElementById('row-count');
    const searchInput = document.getElementById('search-input');
    const exportBtn = document.getElementById('export-btn');
    const themeToggle = document.getElementById('theme-toggle');
    
    // Chart Elements
    const chartType = document.getElementById('chart-type');
    const xAxisSelect = document.getElementById('x-axis');
    const yAxisSelect = document.getElementById('y-axis');
    const generateChartBtn = document.getElementById('generate-chart-btn');
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // State
    let columns = [];
    let currentData = [];
    let sortCol = null;
    let sortDir = 'asc';
    let mainChartInstance = null;

    // --- Theme Toggle ---
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        document.body.classList.toggle('dark-mode');
        themeToggle.textContent = document.body.classList.contains('light-mode') ? 'Toggle Dark Mode' : 'Toggle Light Mode';
        if (mainChartInstance) {
            updateChartTheme();
        }
    });

    // --- File Upload ---
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.textContent = `Uploading ${file.name}...`;
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                uploadStatus.textContent = `${file.name} loaded (${data.rows} rows)`;
                columns = data.columns;
                
                // Show UI
                controlsSection.classList.remove('hidden');
                insightsSection.classList.remove('hidden');
                statsGrid.classList.remove('hidden');
                tableSection.classList.remove('hidden');
                chartsSection.classList.remove('hidden');
                
                populateAxisSelects();
                buildTableHeader();
                fetchData();
                fetchStats();
                fetchInsights();
            } else {
                uploadStatus.textContent = `Error: ${data.error}`;
            }
        } catch (err) {
            uploadStatus.textContent = `Upload failed: ${err.message}`;
        }
    });

    // --- Data Fetching & Table ---
    async function fetchData() {
        const search = searchInput.value;
        try {
            const res = await fetch('/get_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ search, sort_col: sortCol, sort_dir: sortDir })
            });
            const result = await res.json();
            if (result.data) {
                currentData = result.data;
                rowCountEl.textContent = `${result.total} records`;
                renderTable();
            }
        } catch (err) {
            console.error('Failed to fetch data', err);
        }
    }

    function buildTableHeader() {
        tableHeadRow.innerHTML = '';
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.name;
            th.addEventListener('click', () => {
                if (sortCol === col.name) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortCol = col.name;
                    sortDir = 'asc';
                }
                updateSortIcons();
                fetchData();
            });
            tableHeadRow.appendChild(th);
        });
    }

    function updateSortIcons() {
        Array.from(tableHeadRow.children).forEach((th, idx) => {
            const colName = columns[idx].name;
            let text = colName;
            if (colName === sortCol) {
                text += sortDir === 'asc' ? ' ↑' : ' ↓';
            }
            th.textContent = text;
        });
    }

    function renderTable() {
        tableBody.innerHTML = '';
        currentData.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                td.textContent = row[col.name] !== null ? row[col.name] : '';
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
    }

    searchInput.addEventListener('input', () => {
        // Debounce search slightly
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(fetchData, 300);
    });

    // --- Stats & Insights ---
    async function fetchStats() {
        try {
            const res = await fetch('/get_stats');
            const result = await res.json();
            if (result.stats) {
                renderStats(result.stats);
            }
        } catch (err) { console.error('Failed to fetch stats', err); }
    }

    function renderStats(stats) {
        statsGrid.innerHTML = '';
        // Just show mean for up to 4 numeric columns to save space
        let count = 0;
        for (const col in stats) {
            if (count >= 4) break;
            if (stats[col]['mean'] !== undefined) {
                const card = document.createElement('div');
                card.className = 'stat-card glass-panel';
                card.innerHTML = `
                    <div class="stat-title">Avg ${col}</div>
                    <div class="stat-value">${stats[col]['mean']}</div>
                `;
                statsGrid.appendChild(card);
                count++;
            }
        }
        if(count > 0) statsGrid.classList.remove('hidden');
    }

    async function fetchInsights() {
        try {
            const res = await fetch('/get_insights');
            const result = await res.json();
            const list = document.getElementById('insights-list');
            list.innerHTML = '';
            if (result.insights) {
                result.insights.forEach(insight => {
                    const li = document.createElement('li');
                    li.textContent = insight;
                    list.appendChild(li);
                });
            }
        } catch (err) { console.error('Failed to fetch insights', err); }
    }

    // --- Charts ---
    function populateAxisSelects() {
        xAxisSelect.innerHTML = '';
        yAxisSelect.innerHTML = '';
        columns.forEach(col => {
            const optionX = document.createElement('option');
            optionX.value = col.name;
            optionX.textContent = col.name;
            xAxisSelect.appendChild(optionX);

            // Only add numeric columns to Y axis by default for sum/scatter
            if (col.type === 'numeric') {
                const optionY = document.createElement('option');
                optionY.value = col.name;
                optionY.textContent = col.name;
                yAxisSelect.appendChild(optionY);
            }
        });
    }

    generateChartBtn.addEventListener('click', async () => {
        const type = chartType.value;
        const x_col = xAxisSelect.value;
        const y_col = yAxisSelect.value;

        if (!x_col && type !== 'heatmap') return;

        try {
            const res = await fetch('/get_chart_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chart_type: type, x_col, y_col })
            });
            const data = await res.json();
            if (data.error) {
                alert(`Error: ${data.error}`);
                return;
            }
            renderChart(type, data, x_col, y_col);
        } catch (err) {
            console.error('Failed to generate chart', err);
        }
    });

    function getChartColors() {
        const isLight = document.body.classList.contains('light-mode');
        return {
            text: isLight ? '#1a1a2e' : '#ffffff',
            grid: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
            cyan: isLight ? '#0099aa' : '#00f3ff',
            purple: isLight ? '#8000cc' : '#b026ff',
            cyanTrans: isLight ? 'rgba(0,153,170,0.5)' : 'rgba(0,243,255,0.2)',
            purpleTrans: isLight ? 'rgba(128,0,204,0.5)' : 'rgba(176,38,255,0.2)'
        };
    }

    function updateChartTheme() {
        if (!mainChartInstance) return;
        const colors = getChartColors();
        
        Chart.defaults.color = colors.text;
        if(mainChartInstance.options.scales.x) mainChartInstance.options.scales.x.grid.color = colors.grid;
        if(mainChartInstance.options.scales.y) mainChartInstance.options.scales.y.grid.color = colors.grid;
        
        mainChartInstance.update();
    }

    function renderChart(type, data, x_col, y_col) {
        if (mainChartInstance) {
            mainChartInstance.destroy();
        }

        const colors = getChartColors();
        Chart.defaults.color = colors.text;
        Chart.defaults.font.family = "'Roboto', sans-serif";

        let config = {};

        if (['bar', 'pie', 'line'].includes(type)) {
            config = {
                type: type,
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: `Sum of ${y_col} by ${x_col}`,
                        data: data.values,
                        backgroundColor: type === 'pie' ? [colors.cyanTrans, colors.purpleTrans, 'rgba(255,0,127,0.2)', 'rgba(0,255,127,0.2)'] : colors.cyanTrans,
                        borderColor: type === 'pie' ? [colors.cyan, colors.purple, '#ff007f', '#00ff7f'] : colors.cyan,
                        borderWidth: 2,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: type === 'pie' } }
                }
            };
        } else if (type === 'scatter') {
            config = {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: `${y_col} vs ${x_col}`,
                        data: data.data,
                        backgroundColor: colors.purpleTrans,
                        borderColor: colors.purple,
                        pointRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            };
        } else if (type === 'heatmap') {
            // Using chartjs-chart-matrix for heatmap
            config = {
                type: 'matrix',
                data: {
                    datasets: [{
                        label: 'Correlation Heatmap',
                        data: data.data,
                        backgroundColor: function(c) {
                            const value = c.dataset.data[c.dataIndex].v;
                            // scale -1 to 1 into opacity
                            const alpha = (value + 1) / 2;
                            return `rgba(0, 243, 255, ${alpha})`;
                        },
                        borderColor: colors.grid,
                        borderWidth: 1,
                        width: ({chart}) => (chart.chartArea || {}).width / data.labels.length - 1,
                        height: ({chart}) => (chart.chartArea || {}).height / data.labels.length - 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title() { return ''; },
                                label(context) {
                                    const v = context.dataset.data[context.dataIndex];
                                    return [v.x + ' / ' + v.y, 'Correlation: ' + v.v];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'category',
                            labels: data.labels,
                            ticks: { display: true },
                            grid: { display: false }
                        },
                        y: {
                            type: 'category',
                            labels: data.labels,
                            offset: true,
                            ticks: { display: true },
                            grid: { display: false }
                        }
                    }
                }
            };
        }

        // Add standard scales configuration if not already set (like for heatmap)
        if (config.options && !config.options.scales && type !== 'pie' && type !== 'heatmap') {
            config.options.scales = {
                x: { grid: { color: colors.grid } },
                y: { grid: { color: colors.grid } }
            };
        }

        mainChartInstance = new Chart(ctx, config);
    }

    // --- Export CSV ---
    exportBtn.addEventListener('click', () => {
        if (!currentData || currentData.length === 0) return;
        
        const header = columns.map(c => c.name).join(',');
        const rows = currentData.map(row => {
            return columns.map(c => JSON.stringify(row[c.name] || '')).join(',');
        });
        
        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'exported_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
