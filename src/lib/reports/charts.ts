/**
 * Chart configs and PNG rendering via quickchart.io.
 *
 * Extracted verbatim from daily-support-report so the weekly conversation
 * report renders identically without copying 900 lines. Behaviour unchanged —
 * daily-support-report keeps running for the accounts that use it.
 */

export async function renderChartPng(config: any, w = 700, h = 420): Promise<Buffer | null> {
  try {
    const res = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: config,
        width: w,
        height: h,
        backgroundColor: 'white',
        format: 'png',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[chart] quickchart ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e: any) {
    console.error('[chart] render failed:', e?.message || e);
    return null;
  }
}

export function pieChartConfig(title: string, labels: string[], data: number[]) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            '#883fe2', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
            '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
          ],
        },
      ],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { position: 'right', rtl: true, textDirection: 'rtl' },
      plugins: {
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 14 },
          formatter: '(v) => v',
        },
      },
    },
  };
}

export function barChartConfig(title: string, labels: string[], data: number[], color = '#883fe2') {
  return {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{ label: 'פניות', data, backgroundColor: color }],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { display: false },
      plugins: {
        datalabels: {
          color: '#1f2937',
          anchor: 'end',
          align: 'end',
          font: { weight: 'bold' },
        },
      },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
      },
    },
  };
}

export function lineChartConfig(title: string, labels: string[], data: number[]) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'פניות',
          data,
          borderColor: '#883fe2',
          backgroundColor: 'rgba(136, 63, 226, 0.1)',
          fill: true,
          lineTension: 0.3,
        },
      ],
    },
    options: {
      title: { display: true, text: title, fontSize: 18 },
      legend: { display: false },
      scales: {
        yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
      },
    },
  };
}
