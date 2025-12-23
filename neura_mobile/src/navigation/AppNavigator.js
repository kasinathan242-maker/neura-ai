import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { Home, MessageSquare, BookOpen, CheckSquare, Settings } from 'lucide-react-native';

import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import StudyScreen from '../screens/StudyScreen';
import TasksScreen from '../screens/TasksScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PdfScreen from '../screens/PdfScreen';
import CodingScreen from '../screens/CodingScreen';
import VoiceScreen from '../screens/VoiceScreen';
import FlashcardsScreen from '../screens/FlashcardsScreen';
import NotesScreen from '../screens/NotesScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function HomeStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Dashboard" component={HomeScreen} />
            <Stack.Screen name="Pdf" component={PdfScreen} />
            <Stack.Screen name="Coding" component={CodingScreen} />
            <Stack.Screen name="Voice" component={VoiceScreen} />
            <Stack.Screen name="Flashcards" component={FlashcardsScreen} />
            <Stack.Screen name="Notes" component={NotesScreen} />
        </Stack.Navigator>
    );
}

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: '#0f172a',
                        borderTopColor: '#334155',
                        height: 60,
                        paddingBottom: 10,
                        paddingTop: 10,
                    },
                    tabBarActiveTintColor: '#06b6d4',
                    tabBarInactiveTintColor: '#64748b',
                }}
            >
                <Tab.Screen
                    name="Home"
                    component={HomeStack}
                    options={{
                        tabBarIcon: ({ color }) => <Home color={color} size={24} />
                    }}
                />
                <Tab.Screen
                    name="Chat"
                    component={ChatScreen}
                    options={{
                        tabBarIcon: ({ color }) => <MessageSquare color={color} size={24} />
                    }}
                />
                <Tab.Screen
                    name="Study"
                    component={StudyScreen}
                    options={{
                        tabBarIcon: ({ color }) => <BookOpen color={color} size={24} />
                    }}
                />
                <Tab.Screen
                    name="Tasks"
                    component={TasksScreen}
                    options={{
                        tabBarIcon: ({ color }) => <CheckSquare color={color} size={24} />
                    }}
                />
                <Tab.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{
                        tabBarIcon: ({ color }) => <Settings color={color} size={24} />
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}
