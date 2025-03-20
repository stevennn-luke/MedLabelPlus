import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Image, 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  SafeAreaView, 
  TouchableOpacity,
  Alert,
  FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen({ navigation, route }) {
  const [scannedMedications, setScannedMedications] = useState([]);

  useEffect(() => {
    loadScannedMedications();
  }, []);
  

  useEffect(() => {
    if (route.params?.newMedication) {
      addNewMedication(route.params.newMedication);
    }
  }, [route.params?.newMedication]);

  const loadScannedMedications = async () => {
    try {
      const storedMedications = await AsyncStorage.getItem('scannedMedications');
      if (storedMedications) {
        setScannedMedications(JSON.parse(storedMedications));
      }
    } catch (error) {
      console.error('Error loading medications:', error);
    }
  };
  
  const saveScannedMedications = async (medications) => {
    try {
      await AsyncStorage.setItem('scannedMedications', JSON.stringify(medications));
    } catch (error) {
      console.error('Error saving medications:', error);
    }
  };
  
  const addNewMedication = (medication) => {
    const updatedMedications = [medication, ...scannedMedications];
    setScannedMedications(updatedMedications);
    saveScannedMedications(updatedMedications);
  };
  
  const takePhoto = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === 'granted') {
      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (!result.canceled) {
        navigation.navigate('OCR', { imageUri: result.assets[0].uri });
      }
    }
  };
  
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      navigation.navigate('OCR', { imageUri: result.assets[0].uri });
    }
  };
  
  const showImageOptions = () => {
    Alert.alert(
      'Choose an option',
      'How would you like to add an image?',
      [
        { text: 'Take a Picture', onPress: takePhoto },
        { text: 'Choose from Gallery', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  const renderMedicationItem = ({ item }) => (
    <View style={styles.medicationItem}>
      <Image source={{ uri: item.imageUri }} style={styles.medicationImage} />
      <View style={styles.medicationInfo}>
        <Text style={styles.medicationName}>{item.name || 'Unknown Medication'}</Text>
        <Text style={styles.medicationDetails}>
          {item.genericName || 'Generic name not available'}
        </Text>
      </View>
      <TouchableOpacity 
        style={styles.viewDetailsButton}
        onPress={() => navigation.navigate('OCR', { imageUri: item.imageUri })}
      >
        <Text style={styles.viewDetailsText}>View</Text>
      </TouchableOpacity>
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MediVision</Text>
        </View>
      
      {/* MediVision Card */}
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <Text style={styles.cardDescription}>
            MediVision makes identifying medication a breeze. Just snap a photo and instantly know what you're taking. No more squinting at tiny labels or confusion information about your pills on the Internet.
          </Text>
        </View>
        
        <TouchableOpacity 
          style={styles.cardButton} 
          onPress={showImageOptions}
        >
          <Text style={styles.cardButtonText}>Try MediVision</Text>
        </TouchableOpacity>
      </View>
      
      {/* Medication History */}
      {scannedMedications.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>History</Text>
          <FlatList
            data={scannedMedications}
            renderItem={renderMedicationItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={styles.medicationList}
          />
        </View>
      )}
      
      {scannedMedications.length === 0 && (
        <View style={styles.emptyHistoryContainer}>
          <Ionicons name="medical" size={50} color="#ccc" />
          <Text style={styles.emptyHistoryText}>No medications scanned yet</Text>
          <Text style={styles.emptyHistorySubtext}>
            Add your first medication by tapping the "Try MediVision" button above
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: '#000',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    alignItems: 'left',
    marginBottom: 20,
  },
  cardDescription: {
    fontSize: 16,
    color: '#555',
    textAlign: 'left',
    lineHeight: 22,
  },
  cardButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start', 
  },
  cardButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  medicationList: {
    paddingBottom: 20,
  },
  medicationItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  medicationImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  medicationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '600',
  },
  medicationDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  viewDetailsButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  viewDetailsText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyHistoryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyHistoryText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 10,
    color: '#555',
  },
  emptyHistorySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: '80%',
  },
});