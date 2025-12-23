import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static final darkTheme = ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: const Color(0xFF0A0A0F),
    primaryColor: const Color(0xFF6D28D9),
    colorScheme: const ColorScheme.dark(
      primary: Color(0xFF6D28D9),
      secondary: Color(0xFFBE185D),
      tertiary: Color(0xFF0EA5E9),
      surface: Color(0xFF13131F),
      background: Color(0xFF0A0A0F),
    ),
    textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
    useMaterial3: true,
    cardTheme: CardTheme(
      color: const Color(0xFF13131F).withOpacity(0.6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      elevation: 0,
    ),
    appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
    )
  );
}
