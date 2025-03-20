import React, { useState } from 'react';
import { 
  Button, 
  Image, 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  SafeAreaView, 
  TouchableOpacity,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  
  const takePhoto = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === 'granted') {
      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (!result.canceled) {
        setImage(result.assets[0].uri);
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
      setImage(result.assets[0].uri);
      navigation.navigate('OCR', { imageUri: result.assets[0].uri });
    }
  };
  
  const showImageOptions = () => {
    Alert.alert(
      'Choose an option',
      'How would you like to add an image?',
      [
        { text: 'Take a photo', onPress: takePhoto },
        { text: 'Pick an image from gallery', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
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
        
        {image && <Image source={{ uri: image }} style={styles.image} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  backButton: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginLeft: 'auto',
    marginRight: 20,
  },
  image: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 8,
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
    alignItems: 'center',
    marginBottom: 20,
  },
  cardDescription: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
  },
  cardButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
  },
  cardButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  }
});