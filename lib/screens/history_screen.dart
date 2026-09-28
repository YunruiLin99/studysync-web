import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

import '../models/study_snapshot.dart';
import '../services/history_storage.dart';
import '../theme/app_colors.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({
    super.key,
    required this.snapshot,
  });

  final StudySnapshot snapshot;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<HistoryRecord> _records = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await HistoryStorage.loadAll();
    if (!mounted) return;
    setState(() {
      _records = list;
      _loading = false;
    });
  }

  Future<void> _saveCurrent() async {
    await HistoryStorage.saveSnapshot(widget.snapshot);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Saved current status')),
    );
    await _load();
  }

  Future<void> _deleteRecord(int index) async {
    await HistoryStorage.deleteAt(index);
    if (!mounted) return;
    setState(() {
      _records.removeAt(index);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Record deleted')),
    );
  }

  static String _pad2(int n) => n.toString().padLeft(2, '0');

  String _formatTime(DateTime t) {
    return '${t.year}-${_pad2(t.month)}-${_pad2(t.day)} ${_pad2(t.hour)}:${_pad2(t.minute)}';
  }

  String _formatShortTime(DateTime t) {
    return '${_pad2(t.hour)}:${_pad2(t.minute)}';
  }

  IconData _statusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'bright':
        return Icons.wb_sunny_rounded;
      case 'moderate':
        return Icons.wb_twilight_rounded;
      case 'dim':
        return Icons.dark_mode_rounded;
      default:
        return Icons.light_mode_outlined;
    }
  }

  Color _statusColor(ColorScheme cs, String status) {
    switch (status.toLowerCase()) {
      case 'bright':
        return Colors.green.shade700;
      case 'moderate':
        return Colors.orange.shade700;
      case 'dim':
        return cs.error;
      default:
        return cs.primary;
    }
  }

  Widget _buildLuxTrendChart(ThemeData theme, ColorScheme cs) {
    if (_records.isEmpty) return const SizedBox.shrink();

    final chartRecords = _records.reversed.toList();
    final spots = <FlSpot>[];
    for (var i = 0; i < chartRecords.length; i++) {
      spots.add(FlSpot(i.toDouble(), chartRecords[i].lux.toDouble()));
    }

    final maxYData = chartRecords
        .map((r) => r.lux.toDouble())
        .reduce((a, b) => a > b ? a : b);
    final maxY = (maxYData * 1.15).clamp(100, 2200).toDouble();
    final minX = 0.0;
    final maxX = (chartRecords.length - 1).toDouble();

    String bottomLabel(double value) {
      final index = value.round();
      if (index < 0 || index >= chartRecords.length) return '';
      return _formatShortTime(chartRecords[index].time);
    }

    final centerIndex =
        chartRecords.length > 2 ? ((chartRecords.length - 1) / 2).round() : 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 6, 20, 12),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: AppColors.cardLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.show_chart_rounded, color: cs.primary),
              const SizedBox(width: 8),
              Text(
                'Light Trend',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 190,
            child: LineChart(
              LineChartData(
                minX: minX,
                maxX: maxX,
                minY: 0,
                maxY: maxY,
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    tooltipRoundedRadius: 10,
                    getTooltipItems: (touchedSpots) {
                      return touchedSpots.map((spot) {
                        final idx = spot.x.round();
                        final rec = chartRecords[idx];
                        return LineTooltipItem(
                          '${_formatShortTime(rec.time)}\n${rec.lux} lx',
                          theme.textTheme.bodySmall!.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        );
                      }).toList();
                    },
                  ),
                ),
                gridData: FlGridData(
                  show: true,
                  horizontalInterval: maxY <= 300 ? 50 : 100,
                  getDrawingHorizontalLine: (value) => FlLine(
                    color: cs.outlineVariant.withValues(alpha: 0.25),
                    strokeWidth: 1,
                  ),
                  drawVerticalLine: false,
                ),
                borderData: FlBorderData(
                  show: true,
                  border: Border(
                    left: BorderSide(
                      color: cs.outlineVariant.withValues(alpha: 0.4),
                    ),
                    bottom: BorderSide(
                      color: cs.outlineVariant.withValues(alpha: 0.4),
                    ),
                    right: BorderSide.none,
                    top: BorderSide.none,
                  ),
                ),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 38,
                      interval: maxY <= 300 ? 50 : 100,
                      getTitlesWidget: (value, meta) {
                        if (value == 0) return const SizedBox.shrink();
                        return Text(
                          value.toInt().toString(),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: cs.onSurfaceVariant,
                          ),
                        );
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 26,
                      getTitlesWidget: (value, meta) {
                        final idx = value.round();
                        final show = idx == 0 ||
                            idx == centerIndex ||
                            idx == chartRecords.length - 1;
                        if (!show) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            bottomLabel(value),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: cs.onSurfaceVariant,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    barWidth: 3,
                    color: AppColors.primary,
                    isStrokeCapRound: true,
                    belowBarData: BarAreaData(
                      show: true,
                      color: AppColors.primary.withValues(alpha: 0.12),
                    ),
                    dotData: FlDotData(
                      show: chartRecords.length <= 12,
                      getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(
                        radius: 3,
                        color: AppColors.primary,
                        strokeWidth: 1.5,
                        strokeColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.tonal(
                onPressed: _saveCurrent,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text(
                  '📝 Record current status',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
          if (!_loading && _records.isNotEmpty) _buildLuxTrendChart(theme, cs),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _records.isEmpty
                    ? Center(
                        child: Text(
                          'No records yet',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: cs.onSurfaceVariant,
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        itemCount: _records.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final r = _records[index];
                          return Material(
                            color: cs.surfaceContainerHighest.withValues(
                              alpha: 0.65,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: BorderSide(
                                color: cs.outlineVariant.withValues(alpha: 0.4),
                              ),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 18,
                                vertical: 8,
                              ),
                              leading: Container(
                                width: 42,
                                height: 42,
                                decoration: BoxDecoration(
                                  color: _statusColor(
                                    cs,
                                    r.lightStatus,
                                  ).withValues(alpha: 0.16),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(
                                  _statusIcon(r.lightStatus),
                                  color: _statusColor(cs, r.lightStatus),
                                ),
                              ),
                              trailing: IconButton(
                                tooltip: 'Delete',
                                icon: Icon(
                                  Icons.delete_outline_rounded,
                                  color: cs.error,
                                ),
                                onPressed: () => _deleteRecord(index),
                              ),
                              title: Text(
                                _formatTime(r.time),
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(
                                          Icons.wb_sunny_outlined,
                                          size: 16,
                                          color: cs.primary,
                                        ),
                                        const SizedBox(width: 6),
                                        Expanded(
                                          child: Text(
                                            'Light: ${r.lux} lx (${r.lightStatus})',
                                            style: theme.textTheme.bodyMedium,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Row(
                                      children: [
                                        Icon(
                                          Icons.cloud_outlined,
                                          size: 16,
                                          color: cs.primary,
                                        ),
                                        const SizedBox(width: 6),
                                        Expanded(
                                          child: Text(
                                            'Weather: ${r.weather}',
                                            style: theme.textTheme.bodyMedium,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Icon(
                                          Icons.lightbulb_outline_rounded,
                                          size: 16,
                                          color: cs.onSurfaceVariant,
                                        ),
                                        const SizedBox(width: 6),
                                        Expanded(
                                          child: Text(
                                            'Advice: ${r.suggestion}',
                                            style: theme.textTheme.bodyMedium?.copyWith(
                                              color: cs.onSurfaceVariant,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
