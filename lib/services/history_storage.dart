import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/study_snapshot.dart';

class HistoryRecord {
  HistoryRecord({
    required this.time,
    required this.lux,
    required this.lightStatus,
    required this.weather,
    required this.suggestion,
  });

  final DateTime time;
  final int lux;
  final String lightStatus;
  final String weather;
  final String suggestion;

  Map<String, dynamic> toJson() => {
        'time': time.toIso8601String(),
        'lux': lux,
        'lightStatus': lightStatus,
        'weather': weather,
        'suggestion': suggestion,
      };

  static HistoryRecord fromJson(Map<String, dynamic> json) {
    return HistoryRecord(
      time: DateTime.parse(json['time'] as String),
      lux: json['lux'] as int,
      lightStatus: json['lightStatus'] as String,
      weather: (json['weather'] as String?) ?? 'Weather unavailable',
      suggestion: json['suggestion'] as String,
    );
  }
}

const _historyKey = 'study_sync_history';

class HistoryStorage {
  static Future<List<HistoryRecord>> loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_historyKey) ?? [];
    final out = <HistoryRecord>[];
    for (final item in raw) {
      try {
        final map = jsonDecode(item) as Map<String, dynamic>;
        out.add(HistoryRecord.fromJson(map));
      } catch (_) {
        continue;
      }
    }
    return out;
  }

  static Future<void> saveSnapshot(StudySnapshot snapshot) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_historyKey) ?? [];
    final record = HistoryRecord(
      time: DateTime.now(),
      lux: snapshot.lux,
      lightStatus: snapshot.lightStatus,
      weather: snapshot.weather,
      suggestion: snapshot.suggestion,
    );
    list.insert(0, jsonEncode(record.toJson()));
    await prefs.setStringList(_historyKey, list);
  }

  static Future<void> deleteAt(int index) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_historyKey) ?? [];
    if (index < 0 || index >= list.length) return;
    list.removeAt(index);
    await prefs.setStringList(_historyKey, list);
  }
}
