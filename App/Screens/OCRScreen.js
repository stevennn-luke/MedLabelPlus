import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Image, SafeAreaView, TouchableOpacity} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

export default function MedicationOCRScreen({ route }) {
  const { imageUri } = route.params;
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [medicationInfo, setMedicationInfo] = useState({
    name: '',
  });
  const [error, setError] = useState('');
  const [medicationDetails, setMedicationDetails] = useState(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  useEffect(() => {
    const extractText = async () => {
      setLoading(true);
      try {
        // Convert the image to base64
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const base64data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            resolve(reader.result.split(',')[1]); // Remove the data URL prefix
          };
        });

        // Call Google Cloud Vision API
        const apiKey = 'AIzaSyCtf2UA4ly08Jpz4ZexKFY2Ts3lY2XFHyE'; // Replace with your API key
        const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const requestData = {
          requests: [
            {
              image: {
                content: base64data,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1,
                }
              ],
            },
          ],
        };

        const result = await axios.post(apiUrl, requestData);
        const extractedText = result.data.responses[0].fullTextAnnotation?.text || 'No text found.';
        setRawText(extractedText);

        // Process each line from the OCR text
        await processExtractedText(extractedText);
      } catch (error) {
        console.error('OCR Error:', error);
        setError('Failed to extract text from medication label.');
      } finally {
        setLoading(false);
      }
    };

    extractText();
  }, [imageUri]);

  const processExtractedText = async (text) => {
    setFetchingDetails(true);
    
    try {
      // Your existing code...
      // Split the text into lines and prepare for processing
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Try direct API lookup for each non-empty line
      let foundValidMed = false;
      for (const line of lines) {
        // Skip very short lines or lines that are likely not medication names
        if (line.length < 3 || /^[0-9\s]+$/.test(line)) continue;
        
        // Clean the line by removing common noise and limiting to reasonable length
        let cleanedLine = line;
        
        // Extract potential medication name from the line (limit to first 3 words)
        const words = cleanedLine.split(/\s+/);
        const potentialName = words.slice(0, Math.min(words.length, 3)).join(' ');
        
        // Try to validate with RxNav API
        const isValidMed = await checkIfValidMedication(potentialName);
        
        if (isValidMed) {
          // If we found a valid medication, stop checking other lines
          foundValidMed = true;
          break;
        }
      }
      
      // If no line matched a valid medication, try the fallback approaches
      if (!foundValidMed) {
        await handleFallbackApproach(lines);
      }
    } catch (error) {
      console.error('Error processing text:', error);
      // Set default medication info in case of error
      setMedicationInfo({ name: 'Unknown Medication' });
      setMedicationDetails({
        brandName: 'Unknown',
        genericName: 'Unknown',
        activeIngredient: 'Unknown',
        indications: 'Unknown',
        manufacturer: 'Unknown',
      });
    } finally {
      setFetchingDetails(false);
    }
  };

  const checkIfValidMedication = async (name) => {
    try {
      // Special case for Vitamin C
      if (name.toLowerCase().includes('vitamin c')) {
        setMedicationInfo({ name: 'Vitamin C' });
        setMedicationDetails({
          brandName: 'Vitamin C',
          genericName: 'Ascorbic Acid',
          activeIngredient: 'Ascorbic Acid',
          indications: 'Dietary Supplement, Antioxidant',
          manufacturer: 'Unknown',
        });
        return true;
      }
      
      // Use RxNav API for medication validation
      const encodedName = encodeURIComponent(name);
      const rxNavUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodedName}`;
      const rxResponse = await axios.get(rxNavUrl);
      
      if (rxResponse.data && rxResponse.data.drugGroup && 
          rxResponse.data.drugGroup.conceptGroup) {
        const concepts = rxResponse.data.drugGroup.conceptGroup;
        let drugInfo = null;
        
        // Find the first group with drugs
        for (const group of concepts) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            drugInfo = group.conceptProperties[0];
            break;
          }
        }
        
        if (drugInfo) {
          // We found a valid medication in RxNav!
          const confirmedName = drugInfo.name;
          setMedicationInfo({ name: confirmedName });
          
          // Get more details using RxClass API
          await fetchMedicationDetails(drugInfo);
          return true;
        }
      }
    } catch (error) {
      console.error(`Error validating medication name "${name}":`, error);
    }
    
    return false;
  };

  const fetchMedicationDetails = async (drugInfo) => {
    try {
      const confirmedName = drugInfo.name;
      const rxClassUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(confirmedName)}&relaSource=MEDRT`;
      let className = 'Unknown';
      
      try {
        const classResponse = await axios.get(rxClassUrl);
        if (classResponse.data && classResponse.data.rxclassDrugInfoList && 
            classResponse.data.rxclassDrugInfoList.rxclassDrugInfo) {
          const drugClasses = classResponse.data.rxclassDrugInfoList.rxclassDrugInfo;
          if (drugClasses.length > 0) {
            className = drugClasses[0].rxclassMinConceptItem.className;
          }
        }
      } catch (classError) {
        console.error('Error fetching class info:', classError);
      }
      
      // Try getting more detailed info from RxNav
      let activeIngredient = 'Unknown';
      let synonym = drugInfo.synonym || 'Unknown';
      
      // Try to get ingredients
      try {
        const ingredientUrl = `https://rxnav.nlm.nih.gov/REST/rxcui/${drugInfo.rxcui}/related.json?tty=IN`;
        const ingredientResponse = await axios.get(ingredientUrl);
        
        if (ingredientResponse.data && 
            ingredientResponse.data.relatedGroup &&
            ingredientResponse.data.relatedGroup.conceptGroup) {
          const ingredients = ingredientResponse.data.relatedGroup.conceptGroup
            .filter(group => group.tty === 'IN')
            .flatMap(group => group.conceptProperties || []);
            
          if (ingredients.length > 0) {
            activeIngredient = ingredients.map(ing => ing.name).join(', ');
          }
        }
      } catch (ingredientError) {
        console.error('Error fetching ingredients:', ingredientError);
      }
      
      setMedicationDetails({
        brandName: confirmedName,
        genericName: synonym,
        activeIngredient: activeIngredient,
        indications: className || 'Unknown',
        manufacturer: 'Unknown',
      });
    } catch (error) {
      console.error('Error fetching medication details:', error);
      setMedicationDetails({
        brandName: drugInfo.name,
        genericName: drugInfo.synonym || drugInfo.name,
        activeIngredient: 'Unknown',
        indications: 'Unknown',
        manufacturer: 'Unknown',
      });
    }
  };

  const handleFallbackApproach = async (lines) => {
    // Try to find the most likely medication name
    const bestGuessName = findBestMedicationName(lines, rawText);
    setMedicationInfo({ name: bestGuessName });
    
    // Check for common Indian pharmaceutical manufacturers
    const indianManufacturers = [
      'cipla', 'sun pharma', 'lupin', 'dr reddy', 'torrent', 'zydus', 
      'ranbaxy', 'glenmark', 'alkem', 'mankind', 'intas', 'abbott'
    ];
    
    let manufacturer = 'Unknown';
    for (const company of indianManufacturers) {
      if (rawText.toLowerCase().includes(company)) {
        manufacturer = company.charAt(0).toUpperCase() + company.slice(1);
        break;
      }
    }
    
    // Check for common categories
    let category = 'Pharmaceutical Medicine (Indian Region)';
    const lowerText = rawText.toLowerCase();
    if (lowerText.includes('ayur') || lowerText.includes('herbal')) {
      category = 'Ayurvedic/Herbal Medicine';
    } else if (lowerText.includes('homeo')) {
      category = 'Homeopathic Medicine';
    } else if (lowerText.includes('unani')) {
      category = 'Unani Medicine';
    } else if (lowerText.includes('siddha')) {
      category = 'Siddha Medicine';
    }
    
    setMedicationDetails({
      brandName: bestGuessName,
      genericName: 'Not found in medication database',
      activeIngredient: 'Unknown',
      indications: category,
      manufacturer: manufacturer,
    });
  };

  const findBestMedicationName = (lines, fullText) => {
    // Common medication patterns to help identify medication names
    const medPatterns = [
      /\b(tablet|capsule|solution|suspension|injection|syrup|chewable)\b/i,
      /\b\d+\s*(mg|mcg|ml|g)\b/i,
      /\b(extended|controlled|delayed)\s*release\b/i,
      /\b(vitamin|supplement)\b/i,
    ];
    
    let bestLine = '';
    let bestScore = 0;
    
    // Check each line for possible medication name
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;
      
      let score = 0;
      
      // Prioritize lines near the top
      score += Math.max(0, 10 - i);
      
      // Check for common medication name patterns
      for (const pattern of medPatterns) {
        if (pattern.test(line)) {
          score += 5;
        }
      }
      
      // Special case for vitamins
      if (/vitamin\s+[a-z]/i.test(line)) {
        score += 10;
      }
      
      // Bonus for capitalized words that might be brand names
      if (/^[A-Z][a-z]/.test(line)) {
        score += 2;
      }
      
      // Update best guess if this line has a higher score
      if (score > bestScore) {
        bestScore = score;
        // Extract first 1-3 words as likely medicine name
        const words = line.split(/\s+/);
        bestLine = words.slice(0, Math.min(words.length, 3)).join(' ');
      }
    }
    
    // If no good guess, take the first non-empty line
    if (!bestLine && lines.length > 0) {
      const words = lines[0].split(/\s+/);
      bestLine = words.slice(0, Math.min(words.length, 3)).join(' ');
    }
    
    return bestLine || 'Unknown Medication';
  };

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView style={styles.container}>
    <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MediVision</Text>
        </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Analyzing medication label...</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.resultContainer}>
          {/* Original Image & Extracted Text section */}
          <Text style={styles.sectionTitle}>Original Image & Extracted Text</Text>
          <View style={styles.imageTextContainer}>
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: imageUri }} 
                style={styles.medicationImage} 
                resizeMode="contain"
              />
            </View>
            
            <View style={styles.rawTextContainerSide}>
              <Text style={styles.rawText}>{rawText}</Text>
            </View>
          </View>
          
          {/* Medication Information section */}
          <Text style={styles.sectionTitle}>Medication Information</Text>
          
          {fetchingDetails ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={styles.loadingText}>Validating medication and loading details...</Text>
            </View>
          ) : (
            <>
              <View style={styles.infoSection}>
                <Text style={styles.label}>Medication Name:</Text>
                <Text style={styles.value}>{medicationInfo.name || 'Not detected'}</Text>
              </View>
              
              {medicationDetails && (
                <>
                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Generic Name:</Text>
                    <Text style={styles.value}>{medicationDetails.genericName}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Active Ingredient:</Text>
                    <Text style={styles.value}>{medicationDetails.activeIngredient}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Category/Used For:</Text>
                    <Text style={styles.value}>{medicationDetails.indications}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Manufacturer:</Text>
                    <Text style={styles.value}>{medicationDetails.manufacturer}</Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: 100,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#0066CC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    
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
  resultContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 16,
    color: '#333',
  },
  infoSection: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  imageTextContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  imageContainer: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  medicationImage: {
    width: '100%',
    height: 200,
    borderRadius: 6,
  },
  rawTextContainerSide: {
    flex: 1,
    padding: 16,
    maxHeight: 200,
  },
  rawText: {
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
});