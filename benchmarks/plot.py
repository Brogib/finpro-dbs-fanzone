import pandas as pd
import matplotlib.pyplot as plt

try:
    df = pd.read_csv('results.csv')
except FileNotFoundError:
    print("Error: results.csv not found. Please run benchmark.js first.")
    exit(1)

plt.figure(figsize=(8, 6))
bars = plt.bar(df['Database'], df['OperationsPerSecond'], color=['#4DB33D', '#D82C20'])

plt.xlabel('Database System', fontsize=12)
plt.ylabel('Operations Per Second (Inserts)', fontsize=12)
plt.title('FanZone Live: Ingestion Speed Comparison (MongoDB vs Redis)', fontsize=14, fontweight='bold')
plt.grid(axis='y', linestyle='--', alpha=0.7)

for bar in bars:
    yval = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2, yval + (yval*0.02), f'{int(yval)} ops/sec', ha='center', va='bottom', fontweight='bold')

plt.savefig('benchmark_plot.png', dpi=300, bbox_inches='tight')
print("Successfully generated benchmark_plot.png")
