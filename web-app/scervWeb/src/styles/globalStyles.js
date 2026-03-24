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
    /* Pulling directly from your theme.js */
    font-family: ${({ theme }) => theme.fonts.body}; 
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.background};
    -webkit-font-smoothing: antialiased; 
    -moz-osx-font-smoothing: grayscale; 
  }

  a {
    text-decoration: none;
    color: inherit; 
    transition: color 0.2s ease; /* Adds a smooth fade effect on hover */
  }
  
  a:hover {
    color: ${({ theme }) => theme.colors.primary}; /* Uses Scerv Teal instead of standard blue */
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: ${({ theme }) => theme.fonts.heading}; 
    color: ${({ theme }) => theme.colors.text};
    font-weight: 700; 
    line-height: 1.2;
    margin-bottom: 0.5em; 
  }
`;

export default GlobalStyle;
