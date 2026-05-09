import os
import pandas as pd
import numpy as np
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'neon_analytics_super_secret_key'
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def get_current_df():
    filepath = session.get('current_file')
    if not filepath or not os.path.exists(filepath):
        return None
    try:
        return pd.read_csv(filepath)
    except Exception as e:
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.csv'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Validate CSV
            df = pd.read_csv(filepath)
            session['current_file'] = filepath
            
            # Get columns info
            columns = []
            for col in df.columns:
                dtype = str(df[col].dtype)
                col_type = 'numeric' if 'int' in dtype or 'float' in dtype else 'categorical'
                columns.append({'name': col, 'type': col_type})
                
            return jsonify({
                'success': True, 
                'message': 'File uploaded successfully',
                'columns': columns,
                'rows': len(df)
            })
        except Exception as e:
            return jsonify({'error': f'Failed to read CSV: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type. Please upload a CSV.'}), 400

@app.route('/get_data', methods=['POST'])
def get_data():
    df = get_current_df()
    if df is None:
        return jsonify({'error': 'No dataset loaded'}), 400
        
    req = request.json or {}
    search = req.get('search', '').lower()
    sort_col = req.get('sort_col')
    sort_dir = req.get('sort_dir', 'asc')
    
    # Filter
    if search:
        # Search across all columns (convert to string first)
        mask = df.astype(str).apply(lambda x: x.str.lower().str.contains(search)).any(axis=1)
        df = df[mask]
        
    # Sort
    if sort_col and sort_col in df.columns:
        ascending = sort_dir == 'asc'
        df = df.sort_values(by=sort_col, ascending=ascending)
        
    # Replace NaNs with None for JSON serialization
    df = df.replace({np.nan: None})
    
    return jsonify({
        'data': df.to_dict(orient='records'),
        'total': len(df)
    })

@app.route('/get_stats', methods=['GET'])
def get_stats():
    df = get_current_df()
    if df is None:
        return jsonify({'error': 'No dataset loaded'}), 400
        
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.empty:
        return jsonify({'stats': {}})
        
    # Describe returns a dataframe, to_dict gets it into a serializable format
    stats = numeric_df.describe().to_dict()
    
    # Round numbers to 2 decimal places
    for col in stats:
        for metric in stats[col]:
            if isinstance(stats[col][metric], float):
                stats[col][metric] = round(stats[col][metric], 2)
                
    return jsonify({'stats': stats})

@app.route('/get_chart_data', methods=['POST'])
def get_chart_data():
    df = get_current_df()
    if df is None:
        return jsonify({'error': 'No dataset loaded'}), 400
        
    req = request.json or {}
    chart_type = req.get('chart_type')
    x_col = req.get('x_col')
    y_col = req.get('y_col')
    
    try:
        if chart_type in ['bar', 'pie']:
            # Group by X, sum Y
            if not x_col or not y_col:
                return jsonify({'error': 'Missing axes'}), 400
            grouped = df.groupby(x_col)[y_col].sum().reset_index()
            # Sort for better presentation
            grouped = grouped.sort_values(by=y_col, ascending=False).head(10) # Top 10
            return jsonify({
                'labels': grouped[x_col].tolist(),
                'values': grouped[y_col].tolist()
            })
            
        elif chart_type == 'line':
            # Usually date on X, numeric on Y
            if not x_col or not y_col:
                return jsonify({'error': 'Missing axes'}), 400
            grouped = df.groupby(x_col)[y_col].sum().reset_index()
            grouped = grouped.sort_values(by=x_col) # Sort by date/X
            return jsonify({
                'labels': grouped[x_col].tolist(),
                'values': grouped[y_col].tolist()
            })
            
        elif chart_type == 'scatter':
            # Raw x/y pairs
            if not x_col or not y_col:
                return jsonify({'error': 'Missing axes'}), 400
            df_filtered = df.dropna(subset=[x_col, y_col])
            data_points = [{'x': row[x_col], 'y': row[y_col]} for _, row in df_filtered.iterrows()]
            return jsonify({'data': data_points})
            
        elif chart_type == 'heatmap':
            # For heatmap, let's use a correlation matrix of numeric columns
            numeric_df = df.select_dtypes(include=[np.number])
            corr = numeric_df.corr().round(2)
            
            labels = corr.columns.tolist()
            # Convert to matrix format [row, col, value]
            data = []
            for i in range(len(labels)):
                for j in range(len(labels)):
                    data.append({
                        'x': labels[j],
                        'y': labels[i],
                        'v': corr.iloc[i, j]
                    })
                    
            return jsonify({
                'labels': labels,
                'data': data
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
    return jsonify({'error': 'Invalid chart type'}), 400

@app.route('/get_insights', methods=['GET'])
def get_insights():
    df = get_current_df()
    if df is None:
        return jsonify({'error': 'No dataset loaded'}), 400
        
    insights = []
    numeric_df = df.select_dtypes(include=[np.number])
    
    if len(df) > 0:
        insights.append(f"The dataset contains {len(df)} records and {len(df.columns)} columns.")
    
    if not numeric_df.empty:
        # Find highest correlation
        corr = numeric_df.corr().abs()
        np.fill_diagonal(corr.values, 0)
        if not corr.empty:
            max_corr_idx = corr.unstack().idxmax()
            if isinstance(max_corr_idx, tuple) and corr.unstack()[max_corr_idx] > 0.7:
                insights.append(f"Strong correlation ({round(corr.unstack()[max_corr_idx], 2)}) detected between '{max_corr_idx[0]}' and '{max_corr_idx[1]}'.")
        
        # Find column with highest variance/spread
        std_devs = numeric_df.std()
        means = numeric_df.mean()
        # Coefficient of variation
        cv = (std_devs / means).abs().sort_values(ascending=False)
        if not cv.empty:
            insights.append(f"Column '{cv.index[0]}' shows the most relative volatility.")

    categorical_df = df.select_dtypes(include=['object', 'category'])
    if not categorical_df.empty:
        # Find most common value in first categorical column
        col = categorical_df.columns[0]
        top_value = df[col].mode()[0]
        insights.append(f"The most frequent value in '{col}' is '{top_value}'.")

    if not insights:
        insights.append("Not enough numeric or categorical data to generate complex insights.")

    return jsonify({'insights': insights})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
