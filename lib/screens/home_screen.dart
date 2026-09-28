import 'dart:async';
import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../models/study_snapshot.dart';
import '../theme/app_colors.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.onEnvironmentChanged,
  });

  final ValueChanged<StudySnapshot> onEnvironmentChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  // API key 不写进代码：运行时传入 --dart-define=OWM_API_KEY=你的key
  static const String _openWeatherApiKey =
      String.fromEnvironment('OWM_API_KEY');
  static const String _weatherCity = 'London';

  static bool get _platformSupportsLightReading {
    if (kIsWeb) return false;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
      case TargetPlatform.iOS:
        return true;
      default:
        return false;
    }
  }

  CameraController? _cameraController;
  DateTime _lastLightUpdate = DateTime.fromMillisecondsSinceEpoch(0);
  int _lux = 0;
  bool _loading = true;
  String? _sensorError;

  bool _weatherLoading = false;
  double? _weatherTempC;
  String? _weatherDescription;
  String? _weatherError;

  @override
  void initState() {
    super.initState();
    unawaited(_startSensor());
    unawaited(_fetchWeather());
  }

  @override
  void dispose() {
    unawaited(_disposeCamera());
    super.dispose();
  }

  Future<void> _fetchWeather() async {
    if (!mounted) return;
    setState(() {
      _weatherLoading = true;
      _weatherError = null;
    });

    if (_openWeatherApiKey.isEmpty) {
      setState(() {
        _weatherLoading = false;
        _weatherError =
            'Weather API key not set. Run with --dart-define=OWM_API_KEY=your_key';
        _weatherTempC = null;
        _weatherDescription = null;
      });
      _pushSnapshot();
      return;
    }

    final uri = Uri.https('api.openweathermap.org', '/data/2.5/weather', {
      'q': _weatherCity,
      'appid': _openWeatherApiKey,
      'units': 'metric',
    });

    try {
      final response =
          await http.get(uri).timeout(const Duration(seconds: 15));
      if (!mounted) return;

      if (response.statusCode != 200) {
        var message =
            'Weather request failed (HTTP ${response.statusCode}).';
        try {
          final errBody = jsonDecode(response.body) as Map<String, dynamic>;
          final apiMessage = errBody['message'] as String?;
          if (apiMessage != null && apiMessage.isNotEmpty) {
            message = apiMessage;
          }
        } catch (_) {}
        setState(() {
          _weatherLoading = false;
          _weatherError = message;
          _weatherTempC = null;
          _weatherDescription = null;
        });
        _pushSnapshot();
        return;
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final main = data['main'] as Map<String, dynamic>?;
      final weatherList = data['weather'] as List<dynamic>?;
      Map<String, dynamic>? weather;
      if (weatherList != null && weatherList.isNotEmpty) {
        final first = weatherList.first;
        if (first is Map<String, dynamic>) {
          weather = first;
        }
      }

      if (main == null || weather == null || main['temp'] == null) {
        setState(() {
          _weatherLoading = false;
          _weatherError = 'Could not parse weather data.';
          _weatherTempC = null;
          _weatherDescription = null;
        });
        _pushSnapshot();
        return;
      }

      final temp = (main['temp'] as num).toDouble();
      final rawDesc = weather['description'] as String? ?? '';

      setState(() {
        _weatherLoading = false;
        _weatherError = null;
        _weatherTempC = temp;
        _weatherDescription = _titleCaseWords(rawDesc);
      });
      _pushSnapshot();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _weatherLoading = false;
        _weatherError =
            'Could not load weather. Check your connection and try again.';
        _weatherTempC = null;
        _weatherDescription = null;
      });
      _pushSnapshot();
    }
  }

  String _titleCaseWords(String input) {
    if (input.isEmpty) return input;
    return input
        .split(' ')
        .map((w) {
          if (w.isEmpty) return w;
          return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
        })
        .join(' ');
  }

  Future<void> _disposeCamera() async {
    final controller = _cameraController;
    _cameraController = null;
    if (controller == null) return;
    try {
      if (controller.value.isStreamingImages) {
        await controller.stopImageStream();
      }
    } catch (_) {
      // Ignore stream stop failures during dispose/refresh.
    }
    await controller.dispose();
  }

  int _estimateLuxFromImage(CameraImage image) {
    if (image.planes.isEmpty) return _lux;

    double brightness;
    if (image.format.group == ImageFormatGroup.bgra8888) {
      final bytes = image.planes.first.bytes;
      if (bytes.length < 4) return _lux;
      const pixelStride = 4;
      const sampleStep = 16;
      var sum = 0.0;
      var count = 0;
      for (var i = 0; i + 2 < bytes.length; i += pixelStride * sampleStep) {
        final b = bytes[i].toDouble();
        final g = bytes[i + 1].toDouble();
        final r = bytes[i + 2].toDouble();
        final luminance = (0.114 * b) + (0.587 * g) + (0.299 * r);
        sum += luminance / 255.0;
        count++;
      }
      brightness = count == 0 ? 0.0 : sum / count;
    } else {
      final bytes = image.planes.first.bytes;
      if (bytes.isEmpty) return _lux;
      const sampleStep = 16;
      var sum = 0.0;
      var count = 0;
      for (var i = 0; i < bytes.length; i += sampleStep) {
        sum += bytes[i] / 255.0;
        count++;
      }
      brightness = count == 0 ? 0.0 : sum / count;
    }

    final scaled = (brightness * brightness * 1500).round();
    return scaled.clamp(0, 2000);
  }

  void _onCameraFrame(CameraImage image) {
    if (!mounted) return;
    final now = DateTime.now();
    if (now.difference(_lastLightUpdate) < const Duration(milliseconds: 350)) {
      return;
    }
    _lastLightUpdate = now;

    final lux = _estimateLuxFromImage(image);
    setState(() {
      _lux = lux;
      _loading = false;
      _sensorError = null;
    });
    _pushSnapshot();
  }

  Future<void> _startSensor() async {
    setState(() {
      _loading = true;
      _sensorError = null;
    });

    if (!_platformSupportsLightReading) {
      const mock = 180;
      if (mounted) {
        setState(() {
          _lux = mock;
          _loading = false;
          _sensorError =
              'Camera-based light detection is not supported; using simulated values.';
        });
        _pushSnapshot();
      }
      return;
    }

    await _disposeCamera();

    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw CameraException(
          'CameraNotFound',
          'No camera available for ambient light estimation.',
        );
      }
      final selected = cameras.where((c) => c.lensDirection == CameraLensDirection.back).isNotEmpty
          ? cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back)
          : cameras.first;

      final controller = CameraController(
        selected,
        ResolutionPreset.low,
        enableAudio: false,
        imageFormatGroup:
            defaultTargetPlatform == TargetPlatform.iOS
                ? ImageFormatGroup.bgra8888
                : ImageFormatGroup.yuv420,
      );

      await controller.initialize();
      try {
        await controller.setFlashMode(FlashMode.off);
      } catch (_) {
        // Some devices do not support toggling flash in stream mode.
      }

      if (!mounted) {
        await controller.dispose();
        return;
      }

      _cameraController = controller;
      await controller.startImageStream(_onCameraFrame);

      if (mounted && _loading) {
        setState(() {
          _loading = false;
        });
      }
    } on CameraException catch (e) {
      if (!mounted) return;
      final denied =
          e.code == 'CameraAccessDenied' ||
          e.code == 'CameraAccessDeniedWithoutPrompt' ||
          e.code == 'CameraAccessRestricted';
      setState(() {
        _lux = 150;
        _loading = false;
        _sensorError =
            denied
                ? 'Camera permission denied; using simulated values.'
                : 'Camera light detection unavailable; using simulated values.';
      });
      _pushSnapshot();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _lux = 150;
        _loading = false;
        _sensorError =
            'Unable to start camera-based light detection; using simulated values.';
      });
      _pushSnapshot();
    }
  }

  void _pushSnapshot() {
    final c = _classify(_lux);
    widget.onEnvironmentChanged(
      StudySnapshot(
        lux: _lux,
        lightStatus: c.label,
        weather: _currentWeatherSummary(),
        suggestion: c.advice,
      ),
    );
  }

  String _currentWeatherSummary() {
    if (_weatherError != null) {
      return 'Weather unavailable';
    }
    if (_weatherTempC == null || _weatherDescription == null) {
      return 'Weather unavailable';
    }
    return '${_weatherTempC!.toStringAsFixed(1)}°C, $_weatherDescription';
  }

  ({String label, String advice, Color accent, IconData adviceIcon}) _classify(
    int lux,
  ) {
    if (lux < 50) {
      return (
        label: 'Dim',
        advice: 'Poor environment, not recommended',
        accent: Colors.red.shade700,
        adviceIcon: Icons.cancel_rounded,
      );
    }
    if (lux < 400) {
      return (
        label: 'Moderate',
        advice: 'Acceptable, consider improving lighting',
        accent: Colors.orange.shade700,
        adviceIcon: Icons.warning_amber_rounded,
      );
    }
    return (
      label: 'Bright',
      advice: 'Great environment for studying!',
      accent: Colors.green.shade700,
      adviceIcon: Icons.check_circle_rounded,
    );
  }

  Future<void> _onRefresh() async {
    await Future.wait<void>([
      _startSensor(),
      _fetchWeather(),
    ]);
  }

  Widget _buildWeatherBody(ThemeData theme, ColorScheme cs) {
    if (_weatherError != null) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: cs.error, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _weatherError!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: cs.error,
                height: 1.35,
              ),
            ),
          ),
        ],
      );
    }

    if (_weatherLoading && _weatherTempC == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_weatherTempC == null || _weatherDescription == null) {
      return Text(
        'No weather data yet.',
        style: theme.textTheme.bodyLarge?.copyWith(
          color: cs.onSurfaceVariant,
        ),
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.wb_cloudy_outlined, color: cs.primary, size: 36),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_weatherTempC!.toStringAsFixed(1)}°C',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _weatherDescription!,
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                _weatherCity,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHomeHeader(ThemeData theme, ColorScheme cs) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: Colors.white,
              size: 24,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'StudySync',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Your current study environment at a glance',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
              ],
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
    final classification = _classify(_lux);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Home'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: (_loading || _weatherLoading) ? null : _onRefresh,
            icon: (_loading || _weatherLoading)
                ? SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: cs.onPrimary,
                    ),
                  )
                : const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            _AnimatedCardEntry(
              delayMs: 0,
              child: _buildHomeHeader(theme, cs),
            ),
            const SizedBox(height: 14),
            if (_sensorError != null)
              _AnimatedCardEntry(
                delayMs: 80,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Material(
                    color: cs.errorContainer,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: cs.onErrorContainer),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _sensorError!,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: cs.onErrorContainer,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            _AnimatedCardEntry(
              delayMs: 120,
              child: _InfoCard(
                icon: Icons.wb_sunny_outlined,
                title: 'Light',
                backgroundColor:
                    classification.accent.withValues(alpha: 0.16),
                borderColor: classification.accent.withValues(alpha: 0.42),
                iconColor: classification.accent,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _loading ? 'Reading...' : '$_lux lx',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Status: ${classification.label}',
                      style: theme.textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            _AnimatedCardEntry(
              delayMs: 200,
              child: _InfoCard(
                icon: Icons.cloud_outlined,
                title: 'Weather',
                child: _buildWeatherBody(theme, cs),
              ),
            ),
            const SizedBox(height: 14),
            _AnimatedCardEntry(
              delayMs: 280,
              child: _InfoCard(
                icon: Icons.lightbulb_outline_rounded,
                title: 'Study Advice',
                backgroundColor: classification.accent.withValues(alpha: 0.12),
                borderColor: classification.accent.withValues(alpha: 0.35),
                iconColor: classification.accent,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      classification.adviceIcon,
                      color: classification.accent,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        classification.advice,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: classification.accent,
                          height: 1.35,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.child,
    this.backgroundColor,
    this.borderColor,
    this.iconColor,
  });

  final IconData icon;
  final String title;
  final Widget child;
  final Color? backgroundColor;
  final Color? borderColor;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: backgroundColor ?? AppColors.cardLight,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: borderColor ?? cs.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: iconColor ?? cs.primary),
                const SizedBox(width: 10),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}

class _AnimatedCardEntry extends StatelessWidget {
  const _AnimatedCardEntry({
    required this.child,
    required this.delayMs,
  });

  final Widget child;
  final int delayMs;

  @override
  Widget build(BuildContext context) {
    return _DelayedReveal(
      delayMs: delayMs,
      child: child,
    );
  }
}

class _DelayedReveal extends StatefulWidget {
  const _DelayedReveal({
    required this.child,
    required this.delayMs,
  });

  final Widget child;
  final int delayMs;

  @override
  State<_DelayedReveal> createState() => _DelayedRevealState();
}

class _DelayedRevealState extends State<_DelayedReveal> {
  bool _visible = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(Duration(milliseconds: widget.delayMs), () {
      if (!mounted) return;
      setState(() => _visible = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      offset: _visible ? Offset.zero : const Offset(0, 0.08),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOut,
        opacity: _visible ? 1 : 0,
        child: widget.child,
      ),
    );
  }
}
