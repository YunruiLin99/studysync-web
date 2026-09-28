import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:study_sync/main.dart';
import 'package:study_sync/screens/main_screen.dart';

void main() {
  testWidgets('StudySyncApp shows splash with title', (tester) async {
    await tester.pumpWidget(const StudySyncApp());
    await tester.pump();
    expect(find.text('StudySync'), findsWidgets);

    // Splash delay + home HTTP warmup timeout (see HomeScreen).
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('MainScreen shows home and bottom navigation', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6366F1)),
        ),
        home: const MainScreen(),
      ),
    );
    await tester.pump();
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);

    // HomeScreen schedules a short fallback timer and may start HTTP; advance time.
    await tester.pump(const Duration(seconds: 3));
  });
}
