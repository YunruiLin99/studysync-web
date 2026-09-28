/// Latest environment reading shared between Home and History tabs.
class StudySnapshot {
  const StudySnapshot({
    this.lux = 0,
    this.lightStatus = 'Unknown',
    this.weather = 'Weather unavailable',
    this.suggestion = 'Please refresh on the Home screen to get environment data.',
  });

  final int lux;
  final String lightStatus;
  final String weather;
  final String suggestion;

  StudySnapshot copyWith({
    int? lux,
    String? lightStatus,
    String? weather,
    String? suggestion,
  }) {
    return StudySnapshot(
      lux: lux ?? this.lux,
      lightStatus: lightStatus ?? this.lightStatus,
      weather: weather ?? this.weather,
      suggestion: suggestion ?? this.suggestion,
    );
  }
}
