// src/styles/globalStyles.js
import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Poppins', sans-serif; /* Or your chosen font pairing */
    line-height: 1.6;
    color: #333;
    background-color: #f8f8f8;
    -webkit-font-smoothing: antialiased; /* Improve font rendering */
    -moz-osx-font-smoothing: grayscale; /* Improve font rendering */
  }

  a {
    text-decoration: none;
    color: inherit; /* Inherit color from parent by default */
  }
   a:hover {
        color: blue; /* Inherit color from parent by default */
    }

  /* Global styles for headings (optional, but good practice) */
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Poppins', sans-serif; /* Consistent heading font */
    font-weight: 700; /* Or your desired weight */
    line-height: 1.2;
    margin-bottom: 0.5em; /* Consistent spacing below headings */
  }

  /* You can add other global styles here, but be careful not to add anything
     that would interfere with the layout of individual components.  */

`;

export default GlobalStyle;
